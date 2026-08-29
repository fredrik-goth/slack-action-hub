import { App } from '@slack/bolt';
import { taskAggregator } from '../services/taskAggregator';
import { buildEphemeralSummary } from './messages';

export function registerSlashCommands(app: App): void {
  // Handles /actions and /tasks
  const commandHandler = async ({ command, ack, respond }: any) => {
    await ack();

    const text = (command.text || '').trim().toLowerCase();

    if (text === 'sync' || text === 'refresh') {
      await respond({ text: '⏳ Refreshing tasks from Trello & Gmail...' });
      const tasks = await taskAggregator.refreshTasks();
      const stats = taskAggregator.getStats(tasks);
      await respond({
        text: `✅ Sync complete! *${stats.total} total items* loaded.`,
        blocks: buildEphemeralSummary(tasks, stats),
      });
      return;
    }

    // Default overview
    const tasks = await taskAggregator.getTasks();
    const stats = taskAggregator.getStats(tasks);

    await respond({
      blocks: buildEphemeralSummary(tasks, stats),
    });
  };

  app.command('/actions', commandHandler);
  app.command('/tasks', commandHandler);
}
