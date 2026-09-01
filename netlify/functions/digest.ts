/**
 * Netlify Scheduled Function: Morning Digest
 *
 * Runs on a cron schedule and sends each opted-in user a summary of their tasks.
 * Configure the schedule in netlify.toml.
 *
 * Default: 09:00 Mon–Fri (UTC)
 */

import { schedule } from '@netlify/functions';
import { WebClient } from '@slack/web-api';
import { userRepository } from '../../src/db/userRepository';
import { userAggregatorRegistry } from '../../src/services/userAggregatorRegistry';
import { buildMorningDigest } from '../../src/slack/messages';
import { config } from '../../src/config';

const slackClient = new WebClient(config.slack.botToken);

// Netlify scheduled functions use the `schedule` wrapper
// The cron expression here is the fallback; netlify.toml takes precedence
export const handler = schedule('0 9 * * 1-5', async () => {
  console.log('[digest] Sending morning digests...');

  const users = await userRepository.getUsersWithDigestEnabled();

  if (users.length === 0) {
    console.log('[digest] No users with digest enabled — skipping.');
    return { statusCode: 200 };
  }

  let sent = 0;
  for (const user of users) {
    try {
      const aggregator = await userAggregatorRegistry.getForUser(user.slackUserId);
      const tasks = await aggregator.getTasks();
      const stats = aggregator.getStats(tasks);
      const blocks = buildMorningDigest(tasks, stats);

      await slackClient.chat.postMessage({
        channel: user.slackUserId,
        text: `☀️ Good morning! You have ${stats.pending} pending actions for today.`,
        blocks,
      });

      sent++;
      console.log(`[digest] Sent to ${user.slackUserId}`);
    } catch (err) {
      console.error(`[digest] Failed for ${user.slackUserId}:`, err);
    }
  }

  console.log(`[digest] Done — sent to ${sent}/${users.length} users.`);
  return { statusCode: 200 };
});
