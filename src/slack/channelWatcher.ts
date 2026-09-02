import { App } from '@slack/bolt';
import { userRepository } from '../db/userRepository';
import { userAggregatorRegistry } from '../services/userAggregatorRegistry';

// Channel name to watch (without #)
const WATCH_CHANNEL_NAME = 'uppdrag';

// Cached channel ID after first resolution
let watchChannelId: string | null = null;

async function resolveChannelId(client: any): Promise<string | null> {
  if (watchChannelId) return watchChannelId;

  try {
    let cursor: string | undefined;
    do {
      const res = await client.conversations.list({
        limit: 200,
        cursor,
        types: 'public_channel,private_channel',
      });
      const match = (res.channels || []).find(
        (c: any) => c.name?.toLowerCase() === WATCH_CHANNEL_NAME
      );
      if (match) {
        watchChannelId = match.id;
        console.log(`[ChannelWatcher] Resolved #${WATCH_CHANNEL_NAME} → ${watchChannelId}`);
        return watchChannelId;
      }
      cursor = res.response_metadata?.next_cursor;
    } while (cursor);
  } catch (err) {
    console.error('[ChannelWatcher] Error resolving channel ID:', err);
  }

  return null;
}

// Parse <@USERID> mentions from Slack message text
function parseMentions(text: string): string[] {
  const matches = text.match(/<@([A-Z0-9]+)>/g) || [];
  return matches.map((m) => m.replace(/[<@>]/g, ''));
}

export function registerChannelWatcher(app: App): void {
  console.log(`✓ [ChannelWatcher] Watching #${WATCH_CHANNEL_NAME} for @mentions...`);

  app.event('message', async ({ event, client }: any) => {
    // Skip bot messages, edits, deletions
    if (event.bot_id || event.subtype || !event.text) return;

    // Resolve target channel ID lazily
    const targetChannelId = await resolveChannelId(client);
    if (!targetChannelId || event.channel !== targetChannelId) return;

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
