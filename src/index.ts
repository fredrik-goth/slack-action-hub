import { App, LogLevel } from '@slack/bolt';
import { config } from './config';
import { registerSlashCommands } from './slack/commands';
import { registerSlackActions } from './slack/actions';
import { startDigestScheduler } from './services/scheduler';
import { createWebServer } from './web/server';

async function bootstrap(): Promise<void> {
  console.log('====================================================');
  console.log('🚀 Starting Action Hub (Mail & Trello Aggregator)...');
  console.log('====================================================');

  // 1. Initialize & Start Express Web Dashboard Server
  const webApp = createWebServer();
  const server = webApp.listen(config.port, () => {
    console.log(`✓ [Web Dashboard] Running at http://localhost:${config.port}`);
  });

  // 2. Initialize Slack Bolt App (Socket Mode)
  const isSlackConfigured = !!(
    config.slack.botToken &&
    config.slack.appToken &&
    config.slack.signingSecret
  );

  if (isSlackConfigured) {
    try {
      const slackApp = new App({
        token: config.slack.botToken,
        appToken: config.slack.appToken,
        signingSecret: config.slack.signingSecret,
        socketMode: true,
        logLevel: config.nodeEnv === 'development' ? LogLevel.INFO : LogLevel.WARN,
      });

      // Register Handlers
      registerSlashCommands(slackApp);
      registerSlackActions(slackApp);
      startDigestScheduler(slackApp);

      // Start Slack Socket Mode connection
      await slackApp.start();
      console.log('✓ [Slack Bot] Connected via Socket Mode (App Home & Slash Commands ready)');
    } catch (slackError) {
      console.error('⚠️ [Slack Bot] Failed to connect to Slack Socket Mode:', slackError);
      console.log('ℹ [Action Hub] Web Dashboard is still running normally on port', config.port);
    }
  } else {
    console.log('ℹ [Slack Bot] Slack tokens not configured in .env; running in Web Dashboard mode.');
    console.log('ℹ [Slack Bot] To enable Slack, configure SLACK_BOT_TOKEN and SLACK_APP_TOKEN in .env');
  }

  // Graceful shutdown
  const shutdown = () => {
    console.log('\nStopping Action Hub...');
    server.close(() => {
      console.log('✓ Server closed.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((err) => {
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
