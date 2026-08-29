import { App } from '@slack/bolt';
import { taskAggregator } from '../services/taskAggregator';
import { buildHomeTabView } from './homeTab';
import { TaskFilter, TaskSource } from '../types/task';

// In-memory per-user filter preference
const userFilters: Record<string, TaskFilter> = {};

export function registerSlackActions(app: App): void {
  // 1. App Home Opened Event
  app.event('app_home_opened', async ({ event, client }) => {
    try {
      const userId = event.user;
      const filter = userFilters[userId] || { source: 'all' };

      const tasks = await taskAggregator.getTasks(filter);
      const stats = taskAggregator.getStats();
      const providerStatus = taskAggregator.getProviderStatus();

      await client.views.publish({
        user_id: userId,
        view: buildHomeTabView(tasks, stats, filter, providerStatus),
      });
    } catch (error) {
      console.error('[SlackActions] Error publishing Home Tab view:', error);
    }
  });

  // 2. Refresh Button Action
  app.action('action_refresh_tasks', async ({ ack, body, client }) => {
    await ack();
    const userId = body.user.id;
    const filter = userFilters[userId] || { source: 'all' };

    await taskAggregator.refreshTasks();
    const tasks = await taskAggregator.getTasks(filter);
    const stats = taskAggregator.getStats();
    const providerStatus = taskAggregator.getProviderStatus();

    await client.views.publish({
      user_id: userId,
      view: buildHomeTabView(tasks, stats, filter, providerStatus),
    });
  });

  // 3. Filter Buttons Actions (All, Trello, Gmail, Google Tasks)
  const filterActions: Array<{ actionId: string; source: TaskSource | 'all' }> = [
    { actionId: 'filter_source_all', source: 'all' },
    { actionId: 'filter_source_trello', source: 'trello' },
    { actionId: 'filter_source_gmail', source: 'gmail' },
    { actionId: 'filter_source_gtasks', source: 'google_tasks' },
  ];

  filterActions.forEach(({ actionId, source }) => {
    app.action(actionId, async ({ ack, body, client }) => {
      await ack();
      const userId = body.user.id;
      userFilters[userId] = { ...userFilters[userId], source };

      const tasks = await taskAggregator.getTasks(userFilters[userId]);
      const stats = taskAggregator.getStats();
      const providerStatus = taskAggregator.getProviderStatus();

      await client.views.publish({
        user_id: userId,
        view: buildHomeTabView(tasks, stats, userFilters[userId], providerStatus),
      });
    });
  });

  // 4. Complete Task Action
  app.action('action_complete_task', async ({ ack, body, client, action }: any) => {
    await ack();
    const taskId = action.value;
    const userId = body.user.id;
    const filter = userFilters[userId] || { source: 'all' };

    await taskAggregator.completeTask(taskId);

    const tasks = await taskAggregator.getTasks(filter);
    const stats = taskAggregator.getStats();
    const providerStatus = taskAggregator.getProviderStatus();

    await client.views.publish({
      user_id: userId,
      view: buildHomeTabView(tasks, stats, filter, providerStatus),
    });
  });

  // 5. Snooze Task Action (Snoozes for 24h)
  app.action('action_snooze_task', async ({ ack, body, client, action }: any) => {
    await ack();
    const taskId = action.value;
    const userId = body.user.id;
    const filter = userFilters[userId] || { source: 'all' };

    const snoozeDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await taskAggregator.snoozeTask(taskId, snoozeDate);

    const tasks = await taskAggregator.getTasks(filter);
    const stats = taskAggregator.getStats();
    const providerStatus = taskAggregator.getProviderStatus();

    await client.views.publish({
      user_id: userId,
      view: buildHomeTabView(tasks, stats, filter, providerStatus),
    });
  });
}
