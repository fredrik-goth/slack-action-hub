import { KnownBlock } from '@slack/bolt';
import { Provider } from '../db/userRepository';
import { config } from '../config';
import { google } from 'googleapis';

/**
 * Generates the Google OAuth URL for a specific Slack user.
 * The `state` param carries the slackUserId so the callback knows who to store creds for.
 */
export function buildGoogleOAuthUrl(slackUserId: string): string {
  const oauth2Client = new google.auth.OAuth2(
    config.google.clientId,
    config.google.clientSecret,
    config.google.redirectUri
  );
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/tasks',
      'https://www.googleapis.com/auth/calendar.readonly',
    ],
    state: slackUserId,
  });
}

/**
 * Generates the Trello token authorization URL given an API key.
 */
export function buildTrelloAuthUrl(apiKey: string): string {
  return (
    `https://trello.com/1/authorize` +
    `?key=${encodeURIComponent(apiKey)}` +
    `&name=Action+Hub` +
    `&expiration=never` +
    `&response_type=token` +
    `&scope=read,write`
  );
}

/**
 * Builds the Block Kit settings section for the App Home tab.
 * Shows each provider's connection status with connect/disconnect buttons.
 */
export function buildSettingsBlocks(slackUserId: string, connectedProviders: Provider[] = []): KnownBlock[] {
  const connected = new Set(connectedProviders);
  const googleOk = connected.has('google');
  const trelloOk = connected.has('trello');
  const googleConfigured = !!(config.google.clientId && config.google.clientSecret);
  const trelloConfigured = !!config.trello.apiKey;

  const blocks: KnownBlock[] = [
    { type: 'divider' },
    {
      type: 'header',
      text: { type: 'plain_text', text: '⚙️ My Connections', emoji: true },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: 'Connect your tools to start seeing your tasks here. Slack Todos are always available.',
        },
      ],
    },
  ];

  // ── Google Workspace ───────────────────────────────────────────────────────
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: googleOk
        ? '*🟢 Google Workspace* — Gmail, Google Tasks & Calendar connected'
        : '*⚪ Google Workspace* — Gmail, Google Tasks & Calendar',
    },
    accessory: googleOk
      ? {
          type: 'button',
          action_id: 'settings_disconnect_google',
          text: { type: 'plain_text', text: 'Disconnect', emoji: true },
          style: 'danger',
          value: 'google',
          confirm: {
            title: { type: 'plain_text', text: 'Disconnect Google?' },
            text: {
              type: 'mrkdwn',
              text: 'Your Google credentials will be removed. You can reconnect anytime.',
            },
            confirm: { type: 'plain_text', text: 'Yes, disconnect' },
            deny: { type: 'plain_text', text: 'Cancel' },
          },
        }
      : googleConfigured
      ? {
          type: 'button',
          action_id: 'settings_connect_google',
          text: { type: 'plain_text', text: 'Connect Google', emoji: true },
          style: 'primary',
          value: 'google',
        }
      : {
          type: 'button',
          action_id: 'settings_google_not_configured',
          text: { type: 'plain_text', text: 'Not available', emoji: true },
          value: 'noop',
        },
  });

  // ── Trello ─────────────────────────────────────────────────────────────────
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: trelloOk
        ? '*🟢 Trello* — Boards and cards connected'
        : '*⚪ Trello* — Boards and cards',
    },
    accessory: trelloOk
      ? {
          type: 'button',
          action_id: 'settings_disconnect_trello',
          text: { type: 'plain_text', text: 'Disconnect', emoji: true },
          style: 'danger',
          value: 'trello',
          confirm: {
            title: { type: 'plain_text', text: 'Disconnect Trello?' },
            text: {
              type: 'mrkdwn',
              text: 'Your Trello credentials will be removed. You can reconnect anytime.',
            },
            confirm: { type: 'plain_text', text: 'Yes, disconnect' },
            deny: { type: 'plain_text', text: 'Cancel' },
          },
        }
      : trelloConfigured
      ? {
          type: 'button',
          action_id: 'settings_connect_trello',
          text: { type: 'plain_text', text: 'Connect Trello', emoji: true },
          style: 'primary',
          value: 'trello',
        }
      : {
          type: 'button',
          action_id: 'settings_trello_not_configured',
          text: { type: 'plain_text', text: 'Not available', emoji: true },
          value: 'noop',
        },
  });

  // ── Slack Todos ────────────────────────────────────────────────────────────
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: '*🟢 Slack Todos* — Built-in task list, always available',
    },
    accessory: {
      type: 'button',
      action_id: 'settings_add_todo',
      text: { type: 'plain_text', text: '➕ Add Todo', emoji: true },
      value: 'add_todo',
    },
  });

  return blocks;
}

/**
 * Builds the Block Kit view for the "Add Todo" modal.
 */
export function buildAddTodoModal() {
  return {
    type: 'modal' as const,
    callback_id: 'modal_add_todo',
    title: { type: 'plain_text' as const, text: 'Add a Slack Todo', emoji: true },
    submit: { type: 'plain_text' as const, text: 'Add', emoji: true },
    close: { type: 'plain_text' as const, text: 'Cancel', emoji: true },
    blocks: [
      {
        type: 'input',
        block_id: 'todo_title',
        label: { type: 'plain_text' as const, text: 'Task', emoji: true },
        element: {
          type: 'plain_text_input' as const,
          action_id: 'todo_title_input',
          placeholder: { type: 'plain_text' as const, text: 'e.g. Review Q3 report', emoji: true },
          max_length: 200,
        },
      },
      {
        type: 'input',
        block_id: 'todo_priority',
        label: { type: 'plain_text' as const, text: 'Priority', emoji: true },
        element: {
          type: 'static_select' as const,
          action_id: 'todo_priority_select',
          placeholder: { type: 'plain_text' as const, text: 'Select priority', emoji: true },
          initial_option: {
            text: { type: 'plain_text' as const, text: '🔵 Medium', emoji: true },
            value: 'medium',
          },
          options: [
            { text: { type: 'plain_text' as const, text: '🔴 Urgent', emoji: true }, value: 'urgent' },
            { text: { type: 'plain_text' as const, text: '🟡 High', emoji: true }, value: 'high' },
            { text: { type: 'plain_text' as const, text: '🔵 Medium', emoji: true }, value: 'medium' },
            { text: { type: 'plain_text' as const, text: '⚪ Low', emoji: true }, value: 'low' },
          ],
        },
      },
      {
        type: 'input',
        block_id: 'todo_due',
        label: { type: 'plain_text' as const, text: 'Due Date (optional)', emoji: true },
        optional: true,
        element: {
          type: 'datepicker' as const,
          action_id: 'todo_due_date',
          placeholder: { type: 'plain_text' as const, text: 'Select a date', emoji: true },
        },
      },
      {
        type: 'input',
        block_id: 'todo_description',
        label: { type: 'plain_text' as const, text: 'Notes (optional)', emoji: true },
        optional: true,
        element: {
          type: 'plain_text_input' as const,
          action_id: 'todo_description_input',
          multiline: true,
          placeholder: { type: 'plain_text' as const, text: 'Additional context...', emoji: true },
          max_length: 500,
        },
      },
    ],
  };
}

/**
 * Builds the Trello connect modal — Step 1: collect API key.
 */
export function buildTrelloStep1Modal() {
  return {
    type: 'modal' as const,
    callback_id: 'modal_trello_step1',
    title: { type: 'plain_text' as const, text: 'Connect Trello (1/2)', emoji: true },
    submit: { type: 'plain_text' as const, text: 'Next →', emoji: true },
    close: { type: 'plain_text' as const, text: 'Cancel', emoji: true },
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn' as const,
          text: '*Step 1 of 2:* Get your Trello API Key.\n\n' +
            '1. Visit <https://trello.com/app-key|trello.com/app-key>\n' +
            '2. Copy your *API Key* and paste it below.',
        },
      },
      {
        type: 'input',
        block_id: 'trello_api_key',
        label: { type: 'plain_text' as const, text: 'Trello API Key', emoji: true },
        element: {
          type: 'plain_text_input' as const,
          action_id: 'trello_api_key_input',
          placeholder: { type: 'plain_text' as const, text: 'Paste your API Key here', emoji: true },
          min_length: 10,
        },
      },
    ],
  };
}

/**
 * Builds the Trello connect modal — Step 2: authorize and collect token.
 */
export function buildTrelloStep2Modal(apiKey: string) {
  const authUrl = buildTrelloAuthUrl(apiKey);
  return {
    type: 'modal' as const,
    callback_id: 'modal_trello_step2',
    private_metadata: JSON.stringify({ apiKey }),
    title: { type: 'plain_text' as const, text: 'Connect Trello (2/2)', emoji: true },
    submit: { type: 'plain_text' as const, text: 'Connect', emoji: true },
    close: { type: 'plain_text' as const, text: 'Cancel', emoji: true },
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn' as const,
          text: '*Step 2 of 2:* Authorize and get your Trello Token.\n\n' +
            `1. Click this link to authorize: <${authUrl}|Authorize Action Hub on Trello>\n` +
            '2. Copy the token shown on the page\n' +
            '3. Paste it below and click *Connect*',
        },
      },
      {
        type: 'input',
        block_id: 'trello_token',
        label: { type: 'plain_text' as const, text: 'Trello Token', emoji: true },
        element: {
          type: 'plain_text_input' as const,
          action_id: 'trello_token_input',
          placeholder: { type: 'plain_text' as const, text: 'Paste your Trello Token here', emoji: true },
          min_length: 20,
        },
      },
    ],
  };
}
