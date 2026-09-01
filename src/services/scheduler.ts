import cron from 'node-cron';
import { App } from '@slack/bolt';
import { userAggregatorRegistry } from './userAggregatorRegistry';
import { userRepository } from '../db/userRepository';
import { buildMorningDigest } from '../slack/messages';
import { config } from '../config';

export function startDigestScheduler(app: App): void {
  const cronSchedule = config.slack.digestCronSchedule;

  console.log(`✓ [Scheduler] Morning digest scheduled: "${cronSchedule}" (sent to all opted-in users)`);

  cron.schedule(cronSchedule, async () => {
    console.log('[Scheduler] Sending morning digests...');

    const users = await userRepository.getUsersWithDigestEnabled();

    if (users.length === 0) {
      console.log('[Scheduler] No users with digest enabled — skipping.');
      return;
    }

    for (const user of users) {
      try {
        const aggregator = await userAggregatorRegistry.getForUser(user.slackUserId);
        const tasks = await aggregator.getTasks();
        const stats = aggregator.getStats(tasks);
        const blocks = buildMorningDigest(tasks, stats);

        await app.client.chat.postMessage({
          channel: user.slackUserId,
          text: `☀️ Good morning! You have ${stats.pending} pending actions for today.`,
          blocks,
        });

        console.log(`✓ [Scheduler] Digest sent to ${user.slackUserId}`);
      } catch (err) {
        console.error(`[Scheduler] Failed to send digest to ${user.slackUserId}:`, err);
      }
    }

    console.log(`✓ [Scheduler] Morning digest sent to ${users.length} user(s).`);
  });
}
