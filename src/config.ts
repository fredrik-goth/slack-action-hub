import dotenv from 'dotenv';
dotenv.config();

export interface AppConfig {
  port: number;
  nodeEnv: string;
  useMockData: boolean;
  slack: {
    botToken: string;
    appToken: string;
    signingSecret: string;
    digestUserId?: string;
    digestCronSchedule: string;
  };
  trello: {
    apiKey?: string;
    token?: string;
    memberId: string;
  };
  google: {
    clientId?: string;
    clientSecret?: string;
    refreshToken?: string;
    redirectUri?: string;
    gmailQuery: string;
  };
}

export const config: AppConfig = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  useMockData: process.env.USE_MOCK_DATA === 'true' || (!process.env.TRELLO_API_KEY && !process.env.GOOGLE_CLIENT_ID),
  slack: {
    botToken: process.env.SLACK_BOT_TOKEN || '',
    appToken: process.env.SLACK_APP_TOKEN || '',
    signingSecret: process.env.SLACK_SIGNING_SECRET || '',
    digestUserId: process.env.SLACK_DIGEST_USER_ID,
    digestCronSchedule: process.env.DIGEST_CRON_SCHEDULE || '0 9 * * 1-5',
  },
  trello: {
    apiKey: process.env.TRELLO_API_KEY,
    token: process.env.TRELLO_TOKEN,
    memberId: process.env.TRELLO_MEMBER_ID || 'me',
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/oauth2callback',
    gmailQuery: process.env.GMAIL_QUERY || 'is:starred OR label:TODO OR label:"Action Required"',
  },
};
