import { Router, Request, Response } from 'express';
import { google } from 'googleapis';
import { config } from '../config';
import { userRepository } from '../db/userRepository';
import { userAggregatorRegistry } from '../services/userAggregatorRegistry';
import { App } from '@slack/bolt';

export function createOAuthRouter(slackApp: App): Router {
  const router = Router();

  // GET /oauth/google/callback?code=...&state=<slackUserId>
  router.get('/google/callback', async (req: Request, res: Response) => {
    const { code, state: slackUserId } = req.query as Record<string, string>;

    if (!code || !slackUserId) {
      res.status(400).send(htmlPage('Missing Parameters', '❌ Missing authorization code or user ID.'));
      return;
    }

    if (!config.google.clientId || !config.google.clientSecret) {
      res.status(500).send(htmlPage('Not Configured', '❌ Google OAuth is not configured on this server.'));
      return;
    }

    try {
      const oauth2Client = new google.auth.OAuth2(
        config.google.clientId,
        config.google.clientSecret,
        config.google.redirectUri
      );

      const { tokens } = await oauth2Client.getToken(code);

      if (!tokens.refresh_token) {
        res.status(400).send(
          htmlPage(
            'No Refresh Token',
            '❌ No refresh token received.<br><br>' +
              'Please <a href="https://myaccount.google.com/permissions" target="_blank">revoke Action Hub access</a> ' +
              'in your Google account and try connecting again.'
          )
        );
        return;
      }

      await userRepository.ensureUser(slackUserId);
      await userRepository.setCredentials(slackUserId, 'google', {
        refreshToken: tokens.refresh_token,
      });
      userAggregatorRegistry.invalidate(slackUserId);

      // DM the user in Slack confirming the connection
      try {
        await slackApp.client.chat.postMessage({
          channel: slackUserId,
          text: '✅ *Google account connected!* Your Gmail, Google Tasks, and Google Calendar are now synced to Action Hub. Visit your *App Home* to see your tasks.',
        });
      } catch (dmErr) {
        console.warn('[OAuthRouter] Could not send Slack DM after Google connect:', dmErr);
      }

      res.send(
        htmlPage(
          'Google Connected!',
          '✅ <strong>Google account connected!</strong><br><br>' +
            'You can close this window and return to Slack.<br>' +
            'Your Gmail, Tasks, and Calendar are now synced.'
        )
      );
    } catch (err) {
      console.error('[OAuthRouter] Google OAuth callback error:', err);
      res.status(500).send(
        htmlPage('Connection Failed', '❌ Failed to connect your Google account. Please try again.')
      );
    }
  });

  return router;
}

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
