import { App } from '@slack/bolt';
import { userAggregatorRegistry } from '../services/userAggregatorRegistry';
import { userRepository } from '../db/userRepository';
import { buildHomeTabView } from './homeTab';
import { TaskFilter, TaskSource } from '../types/task';
import {
  buildGoogleOAuthUrl,
  buildAddTodoModal,
  buildTrelloStep1Modal,
  buildTrelloStep2Modal,
} from './settings';

// Per-user filter preference (in-memory; survives restarts as a UX nicety, not critical data)
const userFilters: Record<string, TaskFilter> = {};

async function refreshHomeTab(
  client: any,
  userId: string,
  forceRefresh = false
): Promise<void> {
  await userRepository.ensureUser(userId);
  const aggregator = await userAggregatorRegistry.getForUser(userId);
  const filter = userFilters[userId] || { source: 'all' };

  const [tasks, connectedProviders, userInfo] = await Promise.all([
    aggregator.getTasks(filter, forceRefresh),
    userRepository.getConnectedProviders(userId),
    client.users.info({ user: userId }).catch(() => null),
  ]);

  const stats = aggregator.getStats();
  const providerStatus = aggregator.getProviderStatus();
  const isNewUser = connectedProviders.length === 0;

  // Extract first name for the greeting
  const profile = userInfo?.user?.profile;
  const fullName = profile?.display_name || profile?.real_name || userInfo?.user?.name || '';
  const displayName = fullName.split(' ')[0];

  await client.views.publish({
    user_id: userId,
    view: buildHomeTabView(tasks, stats, filter, providerStatus, userId, isNewUser, connectedProviders, displayName),
  });
}

export function registerSlackActions(app: App): void {
  // ── App Home opened ────────────────────────────────────────────────────────
  app.event('app_home_opened', async ({ event, client }) => {
    try {
      await refreshHomeTab(client, event.user);
    } catch (err) {
      console.error('[SlackActions] Error publishing Home Tab:', err);
    }
  });

  // ── Refresh ────────────────────────────────────────────────────────────────
  app.action('action_refresh_tasks', async ({ ack, body, client }) => {
    await ack();
    await refreshHomeTab(client, body.user.id, true);
  });

  // ── Source filter buttons ──────────────────────────────────────────────────
  const filterActions: Array<{ actionId: string; source: TaskSource | 'all' | 'custom' }> = [
    { actionId: 'filter_source_all',      source: 'all' },
    { actionId: 'filter_source_trello',   source: 'trello' },
    { actionId: 'filter_source_gmail',    source: 'gmail' },
    { actionId: 'filter_source_gtasks',   source: 'google_tasks' },
    { actionId: 'filter_source_calendar', source: 'calendar' },
    { actionId: 'filter_source_todos',    source: 'custom' },
  ];

  filterActions.forEach(({ actionId, source }) => {
    app.action(actionId, async ({ ack, body, client }) => {
      await ack();
      const userId = body.user.id;
      userFilters[userId] = { ...userFilters[userId], source: source as any };
      await refreshHomeTab(client, userId);
    });
  });

  // ── Complete task ──────────────────────────────────────────────────────────
  app.action('action_complete_task', async ({ ack, body, client, action }: any) => {
    await ack();
    const userId = body.user.id;
    const aggregator = await userAggregatorRegistry.getForUser(userId);
    await aggregator.completeTask(action.value);
    await refreshHomeTab(client, userId);
  });

  // ── Snooze task ────────────────────────────────────────────────────────────
  app.action('action_snooze_task', async ({ ack, body, client, action }: any) => {
    await ack();
    const userId = body.user.id;
    const aggregator = await userAggregatorRegistry.getForUser(userId);
    await aggregator.snoozeTask(action.value, new Date(Date.now() + 24 * 60 * 60 * 1000));
    await refreshHomeTab(client, userId);
  });

  // ── Agent quick-filter shortcuts ───────────────────────────────────────────
  app.action('agent_btn_urgent', async ({ ack, body, client }: any) => {
    await ack();
    const userId = body.user.id;
    userFilters[userId] = { priority: 'urgent' };
    await refreshHomeTab(client, userId);
  });

  app.action('agent_btn_trello', async ({ ack, body, client }: any) => {
    await ack();
    const userId = body.user.id;
    userFilters[userId] = { source: 'trello' };
    await refreshHomeTab(client, userId);
  });

  app.action('agent_btn_gmail', async ({ ack, body, client }: any) => {
    await ack();
    const userId = body.user.id;
    userFilters[userId] = { source: 'gmail' };
    await refreshHomeTab(client, userId);
  });

  // ── Settings: Connect Google ───────────────────────────────────────────────
  app.action('settings_connect_google', async ({ ack, body, client }: any) => {
    await ack();
    const userId = body.user.id;
    const oauthUrl = buildGoogleOAuthUrl(userId);

    await client.chat.postMessage({
      channel: userId,
      text: `🔗 *Connect Google Workspace*\n\nClick the link below to authorize Action Hub to access your Gmail, Google Tasks, and Google Calendar:\n\n<${oauthUrl}|👉 Connect Google Account>\n\n_You'll be redirected back automatically after authorizing._`,
    });
  });

  // ── Settings: Disconnect Google ────────────────────────────────────────────
  app.action('settings_disconnect_google', async ({ ack, body, client }: any) => {
    await ack();
    const userId = body.user.id;
    await userRepository.removeCredentials(userId, 'google');
    userAggregatorRegistry.invalidate(userId);
    await refreshHomeTab(client, userId);
    await client.chat.postMessage({
      channel: userId,
      text: '✅ *Google Workspace disconnected.* Your credentials have been removed from Action Hub.',
    });
  });

  // ── Settings: Connect Trello (Step 1 modal) ────────────────────────────────
  app.action('settings_connect_trello', async ({ ack, body, client }: any) => {
    await ack();
    await client.views.open({
      trigger_id: body.trigger_id,
      view: buildTrelloStep1Modal(),
    });
  });

  // ── Settings: Disconnect Trello ────────────────────────────────────────────
  app.action('settings_disconnect_trello', async ({ ack, body, client }: any) => {
    await ack();
    const userId = body.user.id;
    await userRepository.removeCredentials(userId, 'trello');
    userAggregatorRegistry.invalidate(userId);
    await refreshHomeTab(client, userId);
    await client.chat.postMessage({
      channel: userId,
      text: '✅ *Trello disconnected.* Your credentials have been removed from Action Hub.',
    });
  });

  // ── Settings: Add Todo button (opens modal) ────────────────────────────────
  app.action('settings_add_todo', async ({ ack, body, client }: any) => {
    await ack();
    await client.views.open({
      trigger_id: body.trigger_id,
      view: buildAddTodoModal(),
    });
  });

  // ── No-op buttons (provider not configured at app level) ──────────────────
  app.action('settings_google_not_configured', async ({ ack, body, client }: any) => {
    await ack();
    await client.chat.postMessage({
      channel: body.user.id,
      text: '⚠️ Google integration is not configured for this workspace. Please ask your admin to set up the Google OAuth credentials.',
    });
  });

  app.action('settings_trello_not_configured', async ({ ack, body, client }: any) => {
    await ack();
    await client.chat.postMessage({
      channel: body.user.id,
      text: '⚠️ Trello integration is not configured for this workspace. Please ask your admin to add a Trello API Key.',
    });
  });

  // ── Modal: Trello Step 1 submission → open Step 2 ─────────────────────────
  app.view('modal_trello_step1', async ({ ack, body, view, client }) => {
    const apiKey = view.state.values['trello_api_key']?.['trello_api_key_input']?.value?.trim();

    if (!apiKey) {
      await ack({ response_action: 'errors', errors: { trello_api_key: 'API Key is required' } });
      return;
    }

    await ack({ response_action: 'update', view: buildTrelloStep2Modal(apiKey) });
  });

  // ── Modal: Trello Step 2 submission → save credentials ────────────────────
  app.view('modal_trello_step2', async ({ ack, body, view, client }) => {
    const token = view.state.values['trello_token']?.['trello_token_input']?.value?.trim();
    let apiKey = '';

    try {
      const meta = JSON.parse(view.private_metadata || '{}');
      apiKey = meta.apiKey || '';
    } catch { /* ignore */ }

    if (!token || !apiKey) {
      await ack({ response_action: 'errors', errors: { trello_token: 'Token is required' } });
      return;
    }

    await ack();

    const userId = body.user.id;
    await userRepository.ensureUser(userId);
    await userRepository.setCredentials(userId, 'trello', { apiKey, token });
    userAggregatorRegistry.invalidate(userId);

    await client.chat.postMessage({
      channel: userId,
      text: '✅ *Trello connected!* Your boards and cards are now syncing to Action Hub. Visit your *App Home* to see your tasks.',
    });

    // Refresh the home tab (can't update view from modal submission — post DM instead)
  });

  // ── Modal: Add Todo submission ─────────────────────────────────────────────
  app.view('modal_add_todo', async ({ ack, body, view, client }) => {
    await ack();

    const userId = body.user.id;
    const title = view.state.values['todo_title']?.['todo_title_input']?.value?.trim() || '';
    const priority = view.state.values['todo_priority']?.['todo_priority_select']?.selected_option?.value || 'medium';
    const dueDate = view.state.values['todo_due']?.['todo_due_date']?.selected_date || undefined;
    const description = view.state.values['todo_description']?.['todo_description_input']?.value?.trim() || undefined;

    if (!title) return;

    await userRepository.ensureUser(userId);
    await userRepository.createTodo(userId, title, { priority, dueDate, description });

    // Invalidate cache so new todo shows immediately
    userAggregatorRegistry.invalidate(userId);

    await client.chat.postMessage({
      channel: userId,
      text: `📌 *Todo added:* "${title}"`,
    });
  });
}
