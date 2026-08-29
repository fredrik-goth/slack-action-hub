import { App, LogLevel } from '@slack/bolt';
import { config } from './config';
import { registerSlackAgent } from './slack/agent';
import { registerSlashCommands } from './slack/commands';
import { registerSlackActions } from './slack/actions';
import { startDigestScheduler } from './services/scheduler';

async function bootstrap(): Promise<void> {
  console.log('===========================================================');
  console.log('⚡ Action Hub Slack Agent (Mail & Trello Aggregator)');
  console.log('===========================================================');

  const isSlackConfigured = !!(
    config.slack.botToken &&
    config.slack.appToken &&
    config.slack.signingSecret
  );

  if (!isSlackConfigured) {
    console.log('\n⚠️  [Configuration Notice]');
    console.log('Slack credentials are not yet configured in your .env file.');
    console.log('To connect your Slack workspace:');
    console.log('1. Copy .env.example to .env (cp .env.example .env)');
    console.log('2. Set SLACK_BOT_TOKEN (xoxb-...) and SLACK_APP_TOKEN (xapp-...)');
    console.log('3. Run npm start / npm run dev\n');
    console.log('Test suite is running in mock/demo mode to verify agent logic.\n');
    return;
  }

  try {
    const slackApp = new App({
      token: config.slack.botToken,
      appToken: config.slack.appToken,
      signingSecret: config.slack.signingSecret,
      socketMode: true,
      logLevel: config.nodeEnv === 'development' ? LogLevel.INFO : LogLevel.WARN,
    });

    // 1. Register Conversational Agent (DMs & Channel Mentions)
    registerSlackAgent(slackApp);

    // 2. Register Slash Commands (/actions, /tasks)
    registerSlashCommands(slackApp);

    // 3. Register Block Kit Interactivity & App Home Tab
    registerSlackActions(slackApp);

    // 4. Start Daily Morning Digest Scheduler
    startDigestScheduler(slackApp);

    // 5. Connect via Socket Mode (no public URLs or ngrok required!)
    await slackApp.start();
    console.log('✓ [Slack Agent] Connected via Socket Mode!');
    console.log('✓ [Slack Agent] App Home Tab, DMs, and Slash Commands are active.');
  } catch (slackError) {
    console.error('❌ [Slack Agent] Failed to connect to Slack:', slackError);
  }

  const shutdown = () => {
    console.log('\nStopping Action Hub Agent...');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((err) => {
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
