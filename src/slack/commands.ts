import { App } from '@slack/bolt';
import { userAggregatorRegistry } from '../services/userAggregatorRegistry';
import { userRepository } from '../db/userRepository';
import { buildEphemeralSummary } from './messages';
import { TaskItem } from '../types/task';
import { KnownBlock } from '@slack/bolt';

export function registerSlashCommands(app: App): void {

  // ── /actions and /tasks ───────────────────────────────────────────────────
  const commandHandler = async ({ command, ack, respond }: any) => {
    await ack();

    const userId = command.user_id;
    const text = (command.text || '').trim().toLowerCase();

    await userRepository.ensureUser(userId);
    const aggregator = await userAggregatorRegistry.getForUser(userId);

    if (text === 'sync' || text === 'refresh') {
      await respond({ text: '⏳ Refreshing your tasks...', response_type: 'ephemeral' });
      const tasks = await aggregator.refreshTasks();
      const stats = aggregator.getStats(tasks);
      await respond({
        text: `✅ Sync complete! *${stats.total} total items* loaded.`,
        blocks: buildEphemeralSummary(tasks, stats),
        response_type: 'ephemeral',
      });
      return;
    }

    if (text === 'connect' || text === 'settings') {
      await respond({
        text: '⚙️ Open your *App Home* tab to connect Google, Trello, and manage settings.',
        response_type: 'ephemeral',
      });
      return;
    }

    // Default: overview
    const tasks = await aggregator.getTasks();
    const stats = aggregator.getStats(tasks);
    await respond({
      blocks: buildEphemeralSummary(tasks, stats),
      response_type: 'ephemeral',
    });
  };

  app.command('/actions', commandHandler);
  app.command('/tasks', commandHandler);

  // ── /focus — high priority and overdue items only ─────────────────────────
  app.command('/focus', async ({ command, ack, respond }: any) => {
    await ack();

    const userId = command.user_id;
    await userRepository.ensureUser(userId);
    const aggregator = await userAggregatorRegistry.getForUser(userId);

    const tasks = await aggregator.getTasks();
    const now = Date.now();
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const focusTasks = tasks
      .filter(t => t.status !== 'completed' && t.source !== 'calendar')
      .filter(t => {
        const isOverdue  = t.dueDate && t.dueDate.getTime() < now;
        const isDueToday = t.dueDate && t.dueDate <= todayEnd;
        const isUrgent   = t.priority === 'urgent' || t.priority === 'high';
        return isOverdue || isDueToday || isUrgent;
      })
      .sort((a, b) => {
        const aOver = a.dueDate && a.dueDate.getTime() < now ? 0 : 1;
        const bOver = b.dueDate && b.dueDate.getTime() < now ? 0 : 1;
        if (aOver !== bOver) return aOver - bOver;
        const p: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
        return (p[a.priority] ?? 2) - (p[b.priority] ?? 2);
      });

    if (focusTasks.length === 0) {
      await respond({
        text: '🎉 Nothing urgent right now — you\'re all caught up on high priority items!',
        response_type: 'ephemeral',
      });
      return;
    }

    const blocks: KnownBlock[] = [
      {
        type: 'header',
        text: { type: 'plain_text', text: `🎯 Focus — ${focusTasks.length} item${focusTasks.length !== 1 ? 's' : ''}`, emoji: true },
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: 'Overdue · due today · high priority — only you can see this' }],
      },
      { type: 'divider' },
    ];

    focusTasks.slice(0, 10).forEach((task: TaskItem) => {
      const dot = task.priority === 'urgent' ? '🔴' : task.priority === 'high' ? '🟡' : '🔵';
      const isOverdue = task.dueDate && task.dueDate.getTime() < now;
      const dateStr = task.dueDate
        ? isOverdue
          ? `⚠️ ${Math.ceil((now - task.dueDate.getTime()) / 86400000)}d overdue`
          : `🗓 Due today`
        : '';

      const sourceIcon: Record<string, string> = {
        trello: '🏷️', gmail: '✉️', google_tasks: '📋', custom: '📌',
      };
      const icon = sourceIcon[task.source] ?? '📌';

      const title = task.title.replace(/^[\p{Emoji}\s]+/u, '').trim() || task.title;

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${dot}  *${title}*\n${icon}  ${dateStr}`,
        },
        accessory: task.url
          ? { type: 'button', action_id: `focus_open_${task.id.slice(0, 28)}`, text: { type: 'plain_text', text: 'Open ↗', emoji: true }, url: task.url }
          : undefined,
      });
    });

    if (focusTasks.length > 10) {
      blocks.push({
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `_+ ${focusTasks.length - 10} more — open App Home for the full list_` }],
      });
    }

    await respond({ blocks, text: `🎯 ${focusTasks.length} high priority items`, response_type: 'ephemeral' });
  });
}
