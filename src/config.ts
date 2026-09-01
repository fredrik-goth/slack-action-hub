import dotenv from 'dotenv';
dotenv.config();

export interface AppConfig {
  port: number;
  nodeEnv: string;
  slack: {
    botToken: string;
    appToken: string;
    signingSecret: string;
    digestCronSchedule: string;
  };
  google: {
    // App-level OAuth credentials (shared across all users)
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    gmailQuery: string;
  };
  trello: {
    // App-level API key (users supply their own token via onboarding)
    apiKey: string;
  };
}

export const config: AppConfig = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  slack: {
    botToken: process.env.SLACK_BOT_TOKEN || '',
    appToken: process.env.SLACK_APP_TOKEN || '',
    signingSecret: process.env.SLACK_SIGNING_SECRET || '',
    digestCronSchedule: process.env.DIGEST_CRON_SCHEDULE || '0 9 * * 1-5',
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri:
      process.env.GOOGLE_REDIRECT_URI ||
      'http://localhost:3000/oauth/google/callback',
    gmailQuery:
      process.env.GMAIL_QUERY || 'is:starred OR label:TODO OR label:"Action Required"',
  },
  trello: {
    apiKey: process.env.TRELLO_API_KEY || '',
  },
};
