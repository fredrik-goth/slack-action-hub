import cron from 'node-cron';
import { App } from '@slack/bolt';
import { taskAggregator } from './taskAggregator';
import { buildMorningDigest } from '../slack/messages';
import { config } from '../config';

export function startDigestScheduler(app: App): void {
  const cronSchedule = config.slack.digestCronSchedule;
  const targetUser = config.slack.digestUserId;

  if (!targetUser) {
    console.log('ℹ [Scheduler] SLACK_DIGEST_USER_ID not configured; morning digest schedule paused.');
    return;
  }

  console.log(`✓ [Scheduler] Morning briefing scheduled: "${cronSchedule}" for user ${targetUser}`);

  cron.schedule(cronSchedule, async () => {
    console.log('[Scheduler] Generating and dispatching morning digest...');
    try {
      const tasks = await taskAggregator.getTasks();
      const stats = taskAggregator.getStats(tasks);
      const blocks = buildMorningDigest(tasks, stats);

      await app.client.chat.postMessage({
        channel: targetUser,
        text: `☀️ Good morning! You have ${stats.pending} pending actions for today.`,
        blocks,
      });
      console.log('✓ [Scheduler] Morning digest successfully sent to Slack.');
    } catch (err) {
      console.error('[Scheduler] Failed to dispatch morning digest:', err);
    }
  });
}
