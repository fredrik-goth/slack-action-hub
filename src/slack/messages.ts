import { KnownBlock } from '@slack/bolt';
import { AggregatedStats, TaskItem } from '../types/task';

export function buildMorningDigest(tasks: TaskItem[], stats: AggregatedStats): KnownBlock[] {
  const blocks: KnownBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '☀️ Good Morning! Here is your Action Hub Briefing',
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `You currently have *${stats.pending} pending actions* (*${stats.overdue} urgent/overdue*, *${stats.dueToday} due today*). Here are your top priority items:`,
      },
    },
    { type: 'divider' },
  ];

  const topTasks = tasks.filter((t) => t.status !== 'completed').slice(0, 5);

  if (topTasks.length === 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '🎉 *Zero pending items!* Enjoy a clear schedule or check your dashboard.',
      },
    });
  } else {
    topTasks.forEach((task) => {
      const priorityEmoji =
        task.priority === 'urgent' ? '🔴' : task.priority === 'high' ? '🟡' : '🔵';
      const sourceTag =
        task.source === 'trello'
          ? `🏷️ Trello (${task.metadata?.boardName || 'Board'})`
          : task.source === 'gmail'
          ? `✉️ Gmail`
          : `📋 Google Tasks`;

      const dueStr = task.dueDate
        ? ` • 🗓️ ${new Date(task.dueDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}`
        : '';

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${priorityEmoji} *${task.title}*\n>${sourceTag}${dueStr}`,
        },
        accessory: task.url
          ? {
              type: 'button',
              action_id: `digest_open_${task.id}`,
              text: { type: 'plain_text', text: 'View', emoji: true },
              url: task.url,
            }
          : undefined,
      });
    });
  }

  blocks.push({ type: 'divider' });
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        action_id: 'action_open_home',
        text: { type: 'plain_text', text: '📱 Open Full Action Hub Home', emoji: true },
        style: 'primary',
        value: 'open_home',
      },
    ],
  });

  return blocks;
}

export function buildEphemeralSummary(tasks: TaskItem[], stats: AggregatedStats): KnownBlock[] {
  const pendingTasks = tasks.filter((t) => t.status !== 'completed');

  const blocks: KnownBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '⚡ Action Hub Quick Summary',
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*📋 Pending Actions:* ${stats.pending}` },
        { type: 'mrkdwn', text: `*🚨 Urgent/Overdue:* ${stats.overdue}` },
        { type: 'mrkdwn', text: `*🏷️ Trello Cards:* ${stats.bySource.trello}` },
        { type: 'mrkdwn', text: `*✉️ Emails / Tasks:* ${stats.bySource.gmail + stats.bySource.google_tasks}` },
      ],
    },
    { type: 'divider' },
  ];

  if (pendingTasks.length === 0) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '🎉 No pending tasks found!' },
    });
  } else {
    pendingTasks.slice(0, 5).forEach((t) => {
      const emoji = t.priority === 'urgent' ? '🔴' : t.priority === 'high' ? '🟡' : '🔵';
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${emoji} *${t.title}* (${t.source.toUpperCase()})`,
        },
      });
    });
  }

  return blocks;
}
