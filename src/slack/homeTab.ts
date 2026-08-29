import { HomeView, KnownBlock } from '@slack/bolt';
import { AggregatedStats, TaskFilter, TaskItem } from '../types/task';

export function buildHomeTabView(
  tasks: TaskItem[],
  stats: AggregatedStats,
  filter?: TaskFilter,
  providerStatus?: Array<{ name: string; configured: boolean }>
): HomeView {
  const blocks: KnownBlock[] = [];

  // 1. Header Banner
  blocks.push({
    type: 'header',
    text: {
      type: 'plain_text',
      text: '🚀 Action Hub: Unified Mail & Trello Tasks',
      emoji: true,
    },
  });

  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `*Last synced:* ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}  •  All your actionable items in one place.`,
      },
    ],
  });

  blocks.push({ type: 'divider' });

  // 2. Visual Metric Stat Callouts
  blocks.push({
    type: 'section',
    fields: [
      {
        type: 'mrkdwn',
        text: `*📋 Total Actions*\n*${stats.total}* items`,
      },
      {
        type: 'mrkdwn',
        text: `*🚨 Overdue / Urgent*\n*${stats.overdue}* items`,
      },
      {
        type: 'mrkdwn',
        text: `*⏳ Due Today*\n*${stats.dueToday}* items`,
      },
      {
        type: 'mrkdwn',
        text: `*✅ Completed*\n*${stats.completed}* items`,
      },
    ],
  });

  blocks.push({ type: 'divider' });

  // 3. Filter Controls
  const activeSource = filter?.source || 'all';
  blocks.push({
    type: 'actions',
    block_id: 'filter_block',
    elements: [
      {
        type: 'button',
        action_id: 'filter_source_all',
        text: { type: 'plain_text', text: `All (${stats.total})`, emoji: true },
        style: activeSource === 'all' ? 'primary' : undefined,
        value: 'all',
      },
      {
        type: 'button',
        action_id: 'filter_source_trello',
        text: {
          type: 'plain_text',
          text: `🏷️ Trello (${stats.bySource.trello})`,
          emoji: true,
        },
        style: activeSource === 'trello' ? 'primary' : undefined,
        value: 'trello',
      },
      {
        type: 'button',
        action_id: 'filter_source_gmail',
        text: {
          type: 'plain_text',
          text: `✉️ Gmail (${stats.bySource.gmail})`,
          emoji: true,
        },
        style: activeSource === 'gmail' ? 'primary' : undefined,
        value: 'gmail',
      },
      {
        type: 'button',
        action_id: 'filter_source_gtasks',
        text: {
          type: 'plain_text',
          text: `📋 Google Tasks (${stats.bySource.google_tasks})`,
          emoji: true,
        },
        style: activeSource === 'google_tasks' ? 'primary' : undefined,
        value: 'google_tasks',
      },
      {
        type: 'button',
        action_id: 'action_refresh_tasks',
        text: { type: 'plain_text', text: '🔄 Refresh Now', emoji: true },
        value: 'refresh',
      },
    ],
  });

  blocks.push({ type: 'divider' });

  // 4. Task List Render
  if (tasks.length === 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '🎉 *You are all caught up!* No pending tasks match your current filter.',
      },
    });
  } else {
    tasks.forEach((task, index) => {
      // Priority badge
      const priorityEmoji =
        task.priority === 'urgent'
          ? '🔴 *URGENT*'
          : task.priority === 'high'
          ? '🟡 *HIGH*'
          : task.priority === 'medium'
          ? '🔵 *MEDIUM*'
          : '⚪ *LOW*';

      // Source & Metadata formatting
      let sourceTag = '';
      if (task.source === 'trello') {
        sourceTag = `🏷️ *Trello* • ${task.metadata?.boardName || 'Board'} ➔ _${task.metadata?.listName || 'List'}_`;
      } else if (task.source === 'gmail') {
        sourceTag = `✉️ *Gmail* • From: _${task.metadata?.sender || 'Unknown'}_`;
      } else if (task.source === 'google_tasks') {
        sourceTag = `📋 *Google Tasks* • _${task.metadata?.listName || 'My Tasks'}_`;
      } else {
        sourceTag = `📌 *Action Item*`;
      }

      // Due date formatting
      let dueFormatted = '';
      if (task.dueDate) {
        const isOverdue = new Date(task.dueDate).getTime() < Date.now();
        const dateStr = new Date(task.dueDate).toLocaleDateString([], {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
        dueFormatted = isOverdue
          ? `⚠️ *Overdue:* ~${dateStr}~`
          : `🗓️ *Due:* ${dateStr}`;
      }

      // Checklists
      let checklistInfo = '';
      if (task.metadata?.checklistProgress) {
        checklistInfo = ` | ☑️ ${task.metadata.checklistProgress.completed}/${task.metadata.checklistProgress.total} subtasks`;
      }

      // Title formatting with strikethrough if completed
      const titleText =
        task.status === 'completed'
          ? `~${task.title}~ (Completed ✅)`
          : `*${task.title}*`;

      const descText = task.description
        ? `\n>${task.description.length > 140 ? task.description.slice(0, 140) + '...' : task.description}`
        : '';

      blocks.push({
        type: 'section',
        block_id: `task_item_${task.id}`,
        text: {
          type: 'mrkdwn',
          text: `${priorityEmoji}  ${titleText}\n${sourceTag}  ${dueFormatted ? `• ${dueFormatted}` : ''}${checklistInfo}${descText}`,
        },
        accessory: task.url
          ? {
              type: 'button',
              action_id: `open_task_${task.id}`,
              text: {
                type: 'plain_text',
                text: '🔗 Open',
                emoji: true,
              },
              url: task.url,
            }
          : undefined,
      });

      // Action Buttons for the task (if not completed)
      if (task.status !== 'completed') {
        blocks.push({
          type: 'actions',
          block_id: `task_actions_${task.id}`,
          elements: [
            {
              type: 'button',
              action_id: 'action_complete_task',
              text: { type: 'plain_text', text: '✅ Complete', emoji: true },
              style: 'primary',
              value: task.id,
            },
            {
              type: 'button',
              action_id: 'action_snooze_task',
              text: { type: 'plain_text', text: '⏰ Snooze (24h)', emoji: true },
              value: task.id,
            },
          ],
        });
      }

      if (index < tasks.length - 1) {
        blocks.push({ type: 'divider' });
      }
    });
  }

  // 5. Footer & Provider Connection Status
  blocks.push({ type: 'divider' });
  if (providerStatus && providerStatus.length > 0) {
    const statusText = providerStatus
      .map((p) => `${p.configured ? '🟢' : '⚪'} *${p.name}*`)
      .join('  |  ');
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `*Connections:* ${statusText}  •  Web Dashboard available at \`http://localhost:3000\``,
        },
      ],
    });
  }

  return {
    type: 'home',
    blocks,
  };
}
