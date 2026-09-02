import { App, KnownBlock } from '@slack/bolt';
import { userAggregatorRegistry } from '../services/userAggregatorRegistry';
import { userRepository } from '../db/userRepository';
import { TaskItem } from '../types/task';

export function registerSlackAgent(app: App): void {
  console.log('✓ [Slack Agent] Registering DM, mention, and assistant listeners...');

  // 1. DM messages only (channel_type === 'im')
  app.event('message', async ({ event, client, say }: any) => {
    if (event.bot_id || event.subtype || !event.text) return;
    // Only respond in DMs, not in channels (channels are handled by channelWatcher or app_mention)
    if (event.channel_type !== 'im') return;

    try {
      await handleUserQuery({
        query: event.text,
        say,
        client,
        channelId: event.channel,
        threadTs: event.thread_ts || event.ts,
        userId: event.user,
      });
    } catch (err) {
      console.error('[Slack Agent] Error in message handler:', err);
    }
  });

  // 2. @mentions in channels
  app.event('app_mention', async ({ event, client, say }: any) => {
    if (!event.text) return;
    const cleanText = event.text.replace(/<@[^>]+>/g, '').trim();

    try {
      await handleUserQuery({
        query: cleanText || 'help',
        say,
        client,
        channelId: event.channel,
        threadTs: event.thread_ts || event.ts,
        userId: event.user,
      });
    } catch (err) {
      console.error('[Slack Agent] Error in app_mention handler:', err);
    }
  });

  // 3. Slack Assistant thread started
  app.event('assistant_thread_started' as any, async ({ event, say }: any) => {
    try {
      await say({ blocks: buildHelpBlocks(), text: '👋 Hi! I am your Action Hub Agent.' });
    } catch (err) {
      console.error('[Slack Assistant] Error in thread started:', err);
    }
  });
}

interface QueryContext {
  query: string;
  say: Function;
  client: any;
  channelId: string;
  threadTs?: string;
  userId: string;
}

async function handleUserQuery(ctx: QueryContext): Promise<void> {
  const { query, say, client, channelId, threadTs, userId } = ctx;
  const normalized = query.trim().toLowerCase();

  // Ensure user exists in DB
  await userRepository.ensureUser(userId);

  const send = async (payload: { text: string; blocks?: KnownBlock[] }) => {
    try {
      await say(payload);
    } catch {
      await client.chat.postMessage({ channel: channelId, thread_ts: threadTs, ...payload });
    }
  };

  const aggregator = await userAggregatorRegistry.getForUser(userId);
  const connectedProviders = await userRepository.getConnectedProviders(userId);

  // 1. Help & greetings
  if (!normalized || ['help', 'hi', 'hello', 'hey'].includes(normalized)) {
    await send({ blocks: buildHelpBlocks(), text: '👋 Hi! I am your Action Hub Agent. How can I help?' });
    return;
  }

  // 2. Connect / setup
  if (normalized.includes('connect') || normalized.includes('setup') || normalized.includes('settings')) {
    await send({
      text: '⚙️ Open your *App Home* tab to connect Google, Trello, and manage your settings.',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '⚙️ *Manage your connections* by visiting the *App Home* tab.\n\nFrom there you can connect *Google Workspace* (Gmail, Tasks, Calendar) and *Trello*, or add *Slack Todos* directly.',
          },
        },
      ],
    });
    return;
  }

  // 3. Add todo (natural language: "add todo: Buy milk" or "remind me to call dentist")
  const todoPatterns = [
    /^add (?:todo|task|item)[:\s]+(.+)/i,
    /^create (?:todo|task)[:\s]+(.+)/i,
    /^remind me to[:\s]+(.+)/i,
    /^todo[:\s]+(.+)/i,
    /^new task[:\s]+(.+)/i,
  ];

  for (const pattern of todoPatterns) {
    const match = query.trim().match(pattern);
    if (match) {
      const title = match[1].trim();
      await userRepository.createTodo(userId, title, { priority: 'medium' });
      userAggregatorRegistry.invalidate(userId);
      await send({ text: `📌 *Todo added:* "${title}"\n\nVisit your App Home to see all your todos, or use _complete ${title}_ to mark it done.` });
      return;
    }
  }

  // 4. Sync / refresh
  if (normalized.includes('sync') || normalized.includes('refresh') || normalized.includes('update')) {
    await send({ text: '🔄 Syncing your latest tasks...' });
    const tasks = await aggregator.refreshTasks();
    const stats = aggregator.getStats(tasks);
    await send({
      blocks: buildSummaryBlocks(tasks, stats, '✅ Sync Complete!'),
      text: `Sync complete! You have ${stats.pending} pending actions.`,
    });
    return;
  }

  // 5. Summary / stats
  if (
    normalized.includes('summary') ||
    normalized.includes('stats') ||
    normalized.includes('overview') ||
    normalized.includes('how many') ||
    normalized === 'status'
  ) {
    const tasks = await aggregator.getTasks();
    const stats = aggregator.getStats(tasks);
    await send({
      blocks: buildSummaryBlocks(tasks, stats, '📊 Action Hub Summary'),
      text: `${stats.pending} pending actions (${stats.overdue} urgent/overdue).`,
    });
    return;
  }

  // 6. Urgent / priority / today
  if (
    normalized.includes('urgent') ||
    normalized.includes('today') ||
    normalized.includes('overdue') ||
    normalized.includes('priority') ||
    normalized.includes('what should i do') ||
    normalized.includes('next')
  ) {
    const tasks = await aggregator.getTasks();
    const urgent = tasks.filter((t) => t.status !== 'completed' && (t.priority === 'urgent' || t.priority === 'high'));
    if (urgent.length === 0) {
      await send({ text: '🎉 Great news! You have no urgent or overdue actions right now.' });
    } else {
      await send({
        blocks: buildTaskListBlocks(urgent, `🚨 High Priority Actions (${urgent.length})`),
        text: `You have ${urgent.length} urgent/high priority actions.`,
      });
    }
    return;
  }

  // 7. Source-specific queries
  if (normalized.includes('trello') || normalized.includes('card') || normalized.includes('board')) {
    const tasks = (await aggregator.getTasks({ source: 'trello' })).filter((t) => t.status !== 'completed');
    await send({ blocks: buildTaskListBlocks(tasks, `🏷️ Trello Cards (${tasks.length})`), text: `${tasks.length} open Trello cards.` });
    return;
  }

  if (normalized.includes('calendar') || normalized.includes('meeting') || normalized.includes('event') || normalized.includes('schedule')) {
    const tasks = (await aggregator.getTasks({ source: 'calendar' })).filter((t) => t.status !== 'completed');
    await send({ blocks: buildTaskListBlocks(tasks, `📅 Calendar Events (${tasks.length})`), text: `${tasks.length} upcoming events.` });
    return;
  }

  if (normalized.includes('mail') || normalized.includes('email') || normalized.includes('gmail') || normalized.includes('inbox')) {
    const tasks = (await aggregator.getTasks({ source: 'gmail' })).filter((t) => t.status !== 'completed');
    await send({ blocks: buildTaskListBlocks(tasks, `✉️ Actionable Emails (${tasks.length})`), text: `${tasks.length} actionable emails.` });
    return;
  }

  if (normalized.includes('google task') || normalized.includes('gtask')) {
    const tasks = (await aggregator.getTasks({ source: 'google_tasks' })).filter((t) => t.status !== 'completed');
    await send({ blocks: buildTaskListBlocks(tasks, `📋 Google Tasks (${tasks.length})`), text: `${tasks.length} pending Google Tasks.` });
    return;
  }

  if (normalized.includes('todo') || normalized.includes('slack task')) {
    const tasks = (await aggregator.getTasks({ source: 'custom' })).filter((t) => t.status !== 'completed');
    await send({ blocks: buildTaskListBlocks(tasks, `📌 Slack Todos (${tasks.length})`), text: `${tasks.length} pending todos.` });
    return;
  }

  // 8. Complete task
  if (normalized.startsWith('done ') || normalized.startsWith('complete ') || normalized.startsWith('finish ')) {
    const target = normalized.replace(/^(done|complete|finish)\s+/i, '').trim();
    const tasks = await aggregator.getTasks();
    const match = tasks.find(
      (t) => t.status !== 'completed' &&
        (t.title.toLowerCase().includes(target) || t.id.toLowerCase().includes(target))
    );

    if (match) {
      await aggregator.completeTask(match.id);
      await send({ text: `✅ Marked as complete: *${match.title}*` });
    } else {
      await send({ text: `⚠️ Could not find an active task matching "${target}". Try typing \`summary\` or check your App Home.` });
    }
    return;
  }

  // 9. Free-text search
  const matches = (await aggregator.getTasks({ searchQuery: query })).filter((t) => t.status !== 'completed');
  if (matches.length > 0) {
    await send({
      blocks: buildTaskListBlocks(matches, `🔍 Results for "${query}" (${matches.length})`),
      text: `Found ${matches.length} tasks matching "${query}".`,
    });
  } else {
    await send({
      text: `🤔 No tasks found matching "${query}".\n\nTry: \`summary\`, \`urgent\`, \`trello\`, \`emails\`, or \`add todo: <task>\``,
    });
  }
}

// ─── Block Kit helpers ────────────────────────────────────────────────────────

function buildHelpBlocks(): KnownBlock[] {
  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: '🤖 Action Hub Agent', emoji: true },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: 'I aggregate your tasks from *Gmail*, *Google Tasks*, *Calendar*, *Trello*, and *Slack Todos* into one place.',
      },
    },
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*What you can ask me:*\n' +
          '• `What are my urgent tasks today?`\n' +
          '• `Show my Trello cards`\n' +
          '• `Any actionable emails?`\n' +
          '• `Summary` or `Stats`\n' +
          '• `Sync my tasks`\n' +
          '• `Add todo: <task name>`\n' +
          '• `Complete <task name>`\n' +
          '• `Settings` — manage connected services',
      },
    },
    {
      type: 'actions',
      elements: [
        { type: 'button', action_id: 'agent_btn_urgent', text: { type: 'plain_text', text: '🚨 Urgent', emoji: true }, style: 'danger', value: 'urgent' },
        { type: 'button', action_id: 'agent_btn_trello', text: { type: 'plain_text', text: '🏷️ Trello', emoji: true }, value: 'trello' },
        { type: 'button', action_id: 'agent_btn_gmail', text: { type: 'plain_text', text: '✉️ Emails', emoji: true }, value: 'gmail' },
        { type: 'button', action_id: 'action_refresh_tasks', text: { type: 'plain_text', text: '🔄 Sync', emoji: true }, value: 'refresh' },
      ],
    },
  ];
}

function buildSummaryBlocks(tasks: TaskItem[], stats: any, headerText: string): KnownBlock[] {
  return [
    { type: 'header', text: { type: 'plain_text', text: headerText, emoji: true } },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*📋 Pending:* ${stats.pending}` },
        { type: 'mrkdwn', text: `*🚨 Overdue:* ${stats.overdue}` },
        { type: 'mrkdwn', text: `*⏳ Due Today:* ${stats.dueToday}` },
        { type: 'mrkdwn', text: `*✅ Completed:* ${stats.completed}` },
        { type: 'mrkdwn', text: `*🏷️ Trello:* ${stats.bySource.trello}` },
        { type: 'mrkdwn', text: `*✉️ Gmail:* ${stats.bySource.gmail}` },
        { type: 'mrkdwn', text: `*📅 Calendar:* ${stats.bySource.calendar}` },
        { type: 'mrkdwn', text: `*📌 Todos:* ${stats.bySource.custom}` },
      ],
    },
    { type: 'divider' },
    { type: 'context', elements: [{ type: 'mrkdwn', text: '💡 _Visit the *App Home* tab for the full dashboard._' }] },
  ];
}

function buildTaskListBlocks(tasks: TaskItem[], title: string): KnownBlock[] {
  const blocks: KnownBlock[] = [
    { type: 'header', text: { type: 'plain_text', text: title, emoji: true } },
    { type: 'divider' },
  ];

  tasks.slice(0, 8).forEach((task) => {
    const priorityEmoji = task.priority === 'urgent' ? '🔴' : task.priority === 'high' ? '🟡' : '🔵';

    let meta = '';
    if (task.source === 'trello')        meta = `🏷️ _${task.metadata?.boardName || 'Trello'} ➔ ${task.metadata?.listName || 'Doing'}_`;
    else if (task.source === 'gmail')    meta = `✉️ _From: ${task.metadata?.sender || 'Gmail'}_`;
    else if (task.source === 'google_tasks') meta = `📋 _${task.metadata?.listName || 'Google Tasks'}_`;
    else if (task.source === 'calendar') meta = `📅 _Calendar_`;
    else                                 meta = `📌 _Slack Todo_`;

    const dueText = task.dueDate
      ? ` • 🗓️ ${new Date(task.dueDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}`
      : '';

    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `${priorityEmoji} *${task.title}*\n${meta}${dueText}` },
      accessory: task.url
        ? { type: 'button', action_id: `agent_open_${task.id.slice(0, 30)}`, text: { type: 'plain_text', text: 'Open 🔗', emoji: true }, url: task.url }
        : undefined,
    });

    blocks.push({
      type: 'actions',
      elements: [
        { type: 'button', action_id: 'action_complete_task', text: { type: 'plain_text', text: '✅ Done', emoji: true }, style: 'primary', value: task.id },
        { type: 'button', action_id: 'action_snooze_task', text: { type: 'plain_text', text: '⏰ Snooze 24h', emoji: true }, value: task.id },
      ],
    });

    blocks.push({ type: 'divider' });
  });

  return blocks;
}
