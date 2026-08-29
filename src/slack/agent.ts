import { App, KnownBlock } from '@slack/bolt';
import { taskAggregator } from '../services/taskAggregator';
import { TaskItem, TaskSource } from '../types/task';

export function registerSlackAgent(app: App): void {
  // Listen to direct messages sent to the bot
  app.message(async ({ message, say }: any) => {
    // Ignore bot messages or subtyped messages without text
    if (message.subtype || !message.text) return;
    await handleUserQuery(message.text, say, message.user);
  });

  // Listen to mentions in channels (@ActionHub)
  app.event('app_mention', async ({ event, say }: any) => {
    if (!event.text) return;
    // Strip the bot mention from the text
    const cleanText = event.text.replace(/<@[^>]+>/g, '').trim();
    await handleUserQuery(cleanText, say, event.user);
  });
}

async function handleUserQuery(query: string, say: Function, userId: string): Promise<void> {
  const normalized = query.trim().toLowerCase();

  // 1. Help & Greetings
  if (
    normalized === 'help' ||
    normalized === 'hi' ||
    normalized === 'hello' ||
    normalized === 'hey' ||
    normalized === ''
  ) {
    await say({
      blocks: buildHelpBlocks(),
      text: '👋 Hi! I am your Action Hub Agent. How can I help you today?',
    });
    return;
  }

  // 2. Sync / Refresh Command
  if (normalized.includes('sync') || normalized.includes('refresh') || normalized.includes('update')) {
    await say({ text: '🔄 Syncing your latest actions from Trello & Gmail...' });
    const tasks = await taskAggregator.refreshTasks();
    const stats = taskAggregator.getStats(tasks);
    await say({
      blocks: buildSummaryBlocks(tasks, stats, '✅ Sync Complete! Here is your current status:'),
      text: `Sync complete! You have ${stats.pending} pending actions.`,
    });
    return;
  }

  // 3. Stats / Summary Overview
  if (
    normalized.includes('summary') ||
    normalized.includes('stats') ||
    normalized.includes('overview') ||
    normalized.includes('how many') ||
    normalized === 'status'
  ) {
    const tasks = await taskAggregator.getTasks();
    const stats = taskAggregator.getStats(tasks);
    await say({
      blocks: buildSummaryBlocks(tasks, stats, '📊 Action Hub Executive Summary'),
      text: `Executive Summary: ${stats.pending} pending actions (${stats.overdue} urgent/overdue).`,
    });
    return;
  }

  // 4. Urgent / Due Today / What should I do
  if (
    normalized.includes('urgent') ||
    normalized.includes('today') ||
    normalized.includes('overdue') ||
    normalized.includes('priority') ||
    normalized.includes('what should i do') ||
    normalized.includes('next')
  ) {
    const tasks = await taskAggregator.getTasks();
    const urgentTasks = tasks.filter(
      (t) => t.status !== 'completed' && (t.priority === 'urgent' || t.priority === 'high')
    );

    if (urgentTasks.length === 0) {
      await say({
        text: '🎉 Great news! You have no urgent or overdue actions right now.',
      });
    } else {
      await say({
        blocks: buildTaskListBlocks(
          urgentTasks,
          `🚨 High Priority & Urgent Actions (${urgentTasks.length})`
        ),
        text: `You have ${urgentTasks.length} urgent/high priority actions.`,
      });
    }
    return;
  }

  // 5. Source-Specific Queries (Trello, Gmail, Google Tasks)
  if (normalized.includes('trello') || normalized.includes('card') || normalized.includes('board')) {
    const tasks = await taskAggregator.getTasks({ source: 'trello' });
    const pending = tasks.filter((t) => t.status !== 'completed');
    await say({
      blocks: buildTaskListBlocks(pending, `🏷️ Trello Cards Assigned to You (${pending.length})`),
      text: `Found ${pending.length} open Trello cards.`,
    });
    return;
  }

  if (
    normalized.includes('mail') ||
    normalized.includes('email') ||
    normalized.includes('gmail') ||
    normalized.includes('inbox')
  ) {
    const tasks = await taskAggregator.getTasks({ source: 'gmail' });
    const pending = tasks.filter((t) => t.status !== 'completed');
    await say({
      blocks: buildTaskListBlocks(pending, `✉️ Actionable Gmail Messages (${pending.length})`),
      text: `Found ${pending.length} actionable email threads.`,
    });
    return;
  }

  if (normalized.includes('google task') || normalized.includes('gtask')) {
    const tasks = await taskAggregator.getTasks({ source: 'google_tasks' });
    const pending = tasks.filter((t) => t.status !== 'completed');
    await say({
      blocks: buildTaskListBlocks(pending, `📋 Google Tasks (${pending.length})`),
      text: `Found ${pending.length} pending Google Tasks.`,
    });
    return;
  }

  // 6. Complete Task via Natural Text (e.g. "complete roadmap", "done contract")
  if (
    normalized.startsWith('done ') ||
    normalized.startsWith('complete ') ||
    normalized.startsWith('finish ')
  ) {
    const searchTarget = normalized.replace(/^(done|complete|finish)\s+/i, '').trim();
    const tasks = await taskAggregator.getTasks();
    const match = tasks.find(
      (t) =>
        t.status !== 'completed' &&
        (t.title.toLowerCase().includes(searchTarget) || t.id.toLowerCase().includes(searchTarget))
    );

    if (match) {
      await taskAggregator.completeTask(match.id);
      await say({
        text: `✅ Marked as complete: *${match.title}*`,
      });
    } else {
      await say({
        text: `⚠️ Could not find an active task matching "${searchTarget}". Try typing \`summary\` or check your App Home.`,
      });
    }
    return;
  }

  // 7. General Search Query
  const matchingTasks = await taskAggregator.getTasks({ searchQuery: query });
  const pendingMatches = matchingTasks.filter((t) => t.status !== 'completed');

  if (pendingMatches.length > 0) {
    await say({
      blocks: buildTaskListBlocks(
        pendingMatches,
        `🔍 Search Results for "${query}" (${pendingMatches.length})`
      ),
      text: `Found ${pendingMatches.length} tasks matching "${query}".`,
    });
  } else {
    await say({
      text: `🤔 I couldn't find any pending actions matching "${query}". Try asking for "urgent tasks", "trello", "emails", or "summary"!`,
    });
  }
}

// ---------------------------------------------------------------------------
// Block Kit Helpers for the Agent
// ---------------------------------------------------------------------------

function buildHelpBlocks(): KnownBlock[] {
  return [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '🤖 Action Hub Agent Assistant',
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: "I continuously aggregate your tasks from **Gmail** and **Trello** into Slack. You can chat with me or check your **App Home Tab** at any time!",
      },
    },
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: "*Here are a few things you can ask me:*\n• `What are my urgent tasks today?`\n• `Show my Trello cards`\n• `Any actionable emails?`\n• `Summary` or `Stats`\n• `Sync my tasks`\n• `Complete <task name>`",
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          action_id: 'agent_btn_urgent',
          text: { type: 'plain_text', text: '🚨 Urgent Tasks', emoji: true },
          style: 'danger',
          value: 'urgent',
        },
        {
          type: 'button',
          action_id: 'agent_btn_trello',
          text: { type: 'plain_text', text: '🏷️ Trello Cards', emoji: true },
          value: 'trello',
        },
        {
          type: 'button',
          action_id: 'agent_btn_gmail',
          text: { type: 'plain_text', text: '✉️ Action Emails', emoji: true },
          value: 'gmail',
        },
        {
          type: 'button',
          action_id: 'action_refresh_tasks',
          text: { type: 'plain_text', text: '🔄 Sync Now', emoji: true },
          value: 'refresh',
        },
      ],
    },
  ];
}

function buildSummaryBlocks(tasks: TaskItem[], stats: any, headerText: string): KnownBlock[] {
  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: headerText, emoji: true },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*📋 Total Pending:* ${stats.pending}` },
        { type: 'mrkdwn', text: `*🚨 Urgent/Overdue:* ${stats.overdue}` },
        { type: 'mrkdwn', text: `*⏳ Due Today:* ${stats.dueToday}` },
        { type: 'mrkdwn', text: `*✅ Completed:* ${stats.completed}` },
        { type: 'mrkdwn', text: `*🏷️ Trello:* ${stats.bySource.trello}` },
        { type: 'mrkdwn', text: `*✉️ Gmail:* ${stats.bySource.gmail}` },
      ],
    },
    { type: 'divider' },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: '💡 _Tip: Visit the **App Home Tab** for the full visual dashboard and one-click controls._',
        },
      ],
    },
  ];
}

function buildTaskListBlocks(tasks: TaskItem[], title: string): KnownBlock[] {
  const blocks: KnownBlock[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: title, emoji: true },
    },
    { type: 'divider' },
  ];

  tasks.slice(0, 8).forEach((task) => {
    const priorityEmoji =
      task.priority === 'urgent' ? '🔴' : task.priority === 'high' ? '🟡' : '🔵';

    let meta = '';
    if (task.source === 'trello') {
      meta = `🏷️ _${task.metadata?.boardName || 'Trello'} ➔ ${task.metadata?.listName || 'Doing'}_`;
    } else if (task.source === 'gmail') {
      meta = `✉️ _From: ${task.metadata?.sender || 'Gmail'}_`;
    } else if (task.source === 'google_tasks') {
      meta = `📋 _${task.metadata?.listName || 'Google Task'}_`;
    }

    const dueText = task.dueDate
      ? ` • 🗓️ ${new Date(task.dueDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}`
      : '';

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${priorityEmoji} *${task.title}*\n${meta}${dueText}`,
      },
      accessory: task.url
        ? {
            type: 'button',
            action_id: `agent_open_${task.id}`,
            text: { type: 'plain_text', text: 'Open 🔗', emoji: true },
            url: task.url,
          }
        : undefined,
    });

    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          action_id: 'action_complete_task',
          text: { type: 'plain_text', text: '✅ Done', emoji: true },
          style: 'primary',
          value: task.id,
        },
        {
          type: 'button',
          action_id: 'action_snooze_task',
          text: { type: 'plain_text', text: '⏰ Snooze 24h', emoji: true },
          value: task.id,
        },
      ],
    });

    blocks.push({ type: 'divider' });
  });

  return blocks;
}
