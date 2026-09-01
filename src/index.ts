import { App, LogLevel } from '@slack/bolt';
import express from 'express';
import { config } from './config';
import { registerSlackAgent } from './slack/agent';
import { registerSlashCommands } from './slack/commands';
import { registerSlackActions } from './slack/actions';
import { startDigestScheduler } from './services/scheduler';
import { createOAuthRouter } from './routes/oauthRouter';

async function bootstrap(): Promise<void> {
  console.log('===========================================================');
  console.log('⚡ Action Hub — Multi-User Slack Task Aggregator');
  console.log('===========================================================');

  console.log('✓ [Storage] Using Netlify Blobs (deploy via Netlify or run with: netlify dev)');

  const isSlackConfigured = !!(
    config.slack.botToken &&
    config.slack.appToken &&
    config.slack.signingSecret
  );

  if (!isSlackConfigured) {
    console.log('\n⚠️  [Configuration Notice]');
    console.log('Slack credentials are not yet configured in your .env file.');
    console.log('1. Copy .env.example to .env');
    console.log('2. Set SLACK_BOT_TOKEN, SLACK_APP_TOKEN, SLACK_SIGNING_SECRET');
    console.log('3. Run npm start / npm run dev\n');
    return;
  }

  // 2. Start Express HTTP server (for OAuth callbacks)
  const expressApp = express();
  expressApp.use(express.json());
  expressApp.use(express.urlencoded({ extended: true }));
  expressApp.get('/health', (_req, res) => res.json({ status: 'ok' }));

  // 3. Create Slack app
  const slackApp = new App({
    token: config.slack.botToken,
    appToken: config.slack.appToken,
    signingSecret: config.slack.signingSecret,
    socketMode: true,
    logLevel: config.nodeEnv === 'development' ? LogLevel.INFO : LogLevel.WARN,
  });

  // 4. Mount OAuth router (needs slackApp to DM users post-auth)
  expressApp.use('/oauth', createOAuthRouter(slackApp));

  // 5. Register all Slack listeners
  registerSlackAgent(slackApp);
  registerSlashCommands(slackApp);
  registerSlackActions(slackApp);

  // 6. Start daily digest scheduler
  startDigestScheduler(slackApp);

  // 7. Start HTTP server (non-fatal — Slack works without it via Socket Mode)
  const httpServer = expressApp.listen(config.port, () => {
    console.log(`✓ [HTTP] Server listening on port ${config.port}`);
    console.log(`  OAuth callback: http://localhost:${config.port}/oauth/google/callback`);
  });
  httpServer.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`⚠️  [HTTP] Port ${config.port} is in use — OAuth callbacks unavailable, but Slack still works.`);
      console.warn(`   To free the port run: lsof -ti:${config.port} | xargs kill -9`);
    } else {
      console.error('[HTTP] Server error:', err);
    }
  });

  // 8. Connect Slack via Socket Mode
  try {
    await slackApp.start();
    console.log('✓ [Slack] Connected via Socket Mode!');
    console.log('✓ [Slack] App Home, DMs, Slash Commands, and Settings are active.');
    console.log('\n  Each workspace member can now connect their own Google and Trello accounts');
    console.log('  via the App Home tab — no shared credentials required.\n');
  } catch (err) {
    console.error('❌ [Slack] Failed to connect:', err);
    process.exit(1);
  }

  const shutdown = () => {
    console.log('\nStopping Action Hub...');
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((err) => {
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
