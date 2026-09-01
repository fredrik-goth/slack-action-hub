/**
 * Netlify Function: Google OAuth callback
 *
 * Google redirects users here after they authorize Action Hub.
 * Set GOOGLE_REDIRECT_URI to:
 *   https://<your-site>.netlify.app/.netlify/functions/oauth-google
 */

import { Handler } from '@netlify/functions';
import { google } from 'googleapis';
import { config } from '../../src/config';
import { userRepository } from '../../src/db/userRepository';
import { userAggregatorRegistry } from '../../src/services/userAggregatorRegistry';
import { WebClient } from '@slack/web-api';

const slackClient = new WebClient(config.slack.botToken);

export const handler: Handler = async (event) => {
  const params = event.queryStringParameters || {};
  const { code, state: slackUserId } = params;

  if (!code || !slackUserId) {
    return { statusCode: 400, body: htmlPage('Missing Parameters', '❌ Missing authorization code or user ID.') };
  }

  if (!config.google.clientId || !config.google.clientSecret) {
    return { statusCode: 500, body: htmlPage('Not Configured', '❌ Google OAuth is not configured on this server.') };
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      config.google.clientId,
      config.google.clientSecret,
      config.google.redirectUri
    );

    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      return {
        statusCode: 400,
        body: htmlPage(
          'No Refresh Token',
          '❌ No refresh token received.<br><br>' +
            'Please <a href="https://myaccount.google.com/permissions" target="_blank">revoke Action Hub access</a> ' +
            'in your Google account and try connecting again.'
        ),
      };
    }

    await userRepository.ensureUser(slackUserId);
    await userRepository.setCredentials(slackUserId, 'google', {
      refreshToken: tokens.refresh_token,
    });
    userAggregatorRegistry.invalidate(slackUserId);

    // DM the user in Slack
    try {
      await slackClient.chat.postMessage({
        channel: slackUserId,
        text: '✅ *Google account connected!* Your Gmail, Google Tasks, and Google Calendar are now synced to Action Hub. Visit your *App Home* to see your tasks.',
      });
    } catch (dmErr) {
      console.warn('[oauth-google] Could not send Slack DM:', dmErr);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: htmlPage(
        'Google Connected!',
        '✅ <strong>Google account connected!</strong><br><br>' +
          'You can close this window and return to Slack.<br>' +
          'Your Gmail, Tasks, and Calendar are now synced.'
      ),
    };
  } catch (err) {
    console.error('[oauth-google] Error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'text/html' },
      body: htmlPage('Connection Failed', '❌ Failed to connect your Google account. Please try again.'),
    };
  }
};

function htmlPage(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — Action Hub</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           display: flex; align-items: center; justify-content: center;
           min-height: 100vh; margin: 0; background: #f4f5f7; }
    .card { background: white; border-radius: 12px; padding: 40px 48px;
            text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,.1); max-width: 480px; }
    h2 { color: #1d1c1d; margin-top: 0; }
    p { color: #616061; line-height: 1.6; }
    a { color: #4a154b; }
  </style>
</head>
<body>
  <div class="card">
    <h2>${title}</h2>
    <p>${body}</p>
  </div>
</body>
</html>`;
}
