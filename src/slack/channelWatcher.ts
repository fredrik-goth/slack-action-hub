import { App } from '@slack/bolt';
import { userRepository } from '../db/userRepository';
import { userAggregatorRegistry } from '../services/userAggregatorRegistry';

// Channel name to watch (without #)
const WATCH_CHANNEL_NAME = 'uppdrag';

// Cached channel ID after first resolution
let watchChannelId: string | null = process.env.UPPDRAG_CHANNEL_ID || null;

if (watchChannelId) {
  console.log(`[ChannelWatcher] Using UPPDRAG_CHANNEL_ID from env: ${watchChannelId}`);
}

// Check a specific channel ID by calling conversations.info
async function resolveChannelId(client: any, candidateChannelId: string): Promise<boolean> {
  if (watchChannelId) return candidateChannelId === watchChannelId;

  try {
    const res = await client.conversations.info({ channel: candidateChannelId });
    const name: string = res.channel?.name?.toLowerCase() || '';
    if (name === WATCH_CHANNEL_NAME) {
      watchChannelId = candidateChannelId;
      console.log(`[ChannelWatcher] Resolved #${WATCH_CHANNEL_NAME} → ${watchChannelId}`);
      return true;
    }
    return false;
  } catch (err: any) {
    // missing_scope or channel_not_found — log once, then fall back to name comparison on the event
    console.error(`[ChannelWatcher] conversations.info failed (${err?.data?.error || err?.message}). Set UPPDRAG_CHANNEL_ID in .env to skip this lookup.`);
    return false;
  }
}

// Parse <@USERID> mentions from Slack message text
function parseMentions(text: string): string[] {
  const matches = text.match(/<@([A-Z0-9]+)>/g) || [];
  return matches.map((m) => m.replace(/[<@>]/g, ''));
}

export function registerChannelWatcher(app: App): void {
  console.log(`✓ [ChannelWatcher] Watching #${WATCH_CHANNEL_NAME} for @mentions...`);

  app.event('message', async ({ event, client }: any) => {
    // Skip bot messages, edits, deletions, and DMs
    if (event.bot_id || event.subtype || !event.text) return;
    if (event.channel_type === 'im') return;

    // Check if this message is from the watched channel
    const isTarget = await resolveChannelId(client, event.channel);
    if (!isTarget) return;

    console.log(`[ChannelWatcher] Message received in #${WATCH_CHANNEL_NAME} from ${event.user}`);

    const mentions = parseMentions(event.text);
    if (mentions.length === 0) return;

    console.log(`[ChannelWatcher] Message in #${WATCH_CHANNEL_NAME} mentions: ${mentions.join(', ')}`);

    // Try to get the poster's display name
    let postedBy = event.user || 'someone';
    try {
      const info = await client.users.info({ user: event.user });
      const profile = info.user?.profile;
      postedBy = profile?.display_name || profile?.real_name || info.user?.name || postedBy;
    } catch { /* ignore */ }

    for (const userId of mentions) {
      try {
        await userRepository.ensureUser(userId);
        await userRepository.createAssignment({
          slackUserId: userId,
          channelId: event.channel,
          messageTs: event.ts,
          text: event.text,
          postedBy,
          channelName: WATCH_CHANNEL_NAME,
          status: 'pending',
        });

        // Invalidate aggregator cache so the new assignment shows on next refresh
        userAggregatorRegistry.invalidate(userId);

        // DM the mentioned user
        const tsParts = event.ts.replace('.', '');
        const link = `https://slack.com/archives/${event.channel}/p${tsParts}`;
        await client.chat.postMessage({
          channel: userId,
          text: `📨 *New assignment in #${WATCH_CHANNEL_NAME}*\n\n${event.text.replace(/<@[^>]+>/g, '').trim() || '(see original message)'}\n\n<${link}|View message →>`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `📨 *New assignment from ${postedBy} in #${WATCH_CHANNEL_NAME}*\n\n${event.text.replace(/<@[^>]+>/g, '').trim() || '(see original message)'}`,
              },
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  action_id: 'assignment_keep',
                  text: { type: 'plain_text', text: '✅ Keep', emoji: true },
                  style: 'primary',
                  value: `asgn_${userId}_${event.ts.replace('.', '_')}`,
                },
                {
                  type: 'button',
                  action_id: 'assignment_remove',
                  text: { type: 'plain_text', text: '🗑 Remove', emoji: true },
                  style: 'danger',
                  value: `asgn_${userId}_${event.ts.replace('.', '_')}`,
                },
                {
                  type: 'button',
                  action_id: 'assignment_open',
                  text: { type: 'plain_text', text: 'View ↗', emoji: true },
                  url: link,
                  value: 'open',
                },
              ],
            },
          ],
        });
      } catch (err) {
        console.error(`[ChannelWatcher] Error processing assignment for ${userId}:`, err);
      }
    }
  });
}
