/**
 * Netlify Function: Slack event handler (HTTP mode)
 *
 * This replaces Socket Mode for production. Slack sends HTTP POST requests
 * here for all events, actions, commands, and modals.
 *
 * Set this as your Slack Request URL:
 *   https://<your-site>.netlify.app/.netlify/functions/slack
 */

import { App, ExpressReceiver } from '@slack/bolt';
import serverless from 'serverless-http';
import express from 'express';
import { Handler } from '@netlify/functions';
import { config } from '../../src/config';
import { registerSlackAgent } from '../../src/slack/agent';
import { registerSlashCommands } from '../../src/slack/commands';
import { registerSlackActions } from '../../src/slack/actions';

// Cached across warm Netlify invocations to avoid rebuilding every call
let cachedHandler: ReturnType<typeof serverless> | null = null;

function getServerlessHandler() {
  if (cachedHandler) return cachedHandler;

  const receiver = new ExpressReceiver({
    signingSecret: config.slack.signingSecret,
    endpoints: '/slack/events',
    processBeforeResponse: true,
  });

  const slackApp = new App({
    token: config.slack.botToken,
    receiver,
  });

  registerSlackAgent(slackApp);
  registerSlashCommands(slackApp);
  registerSlackActions(slackApp);

  cachedHandler = serverless(receiver.app as express.Express);
  return cachedHandler;
}

export const handler: Handler = async (event, context) => {
  const fn = getServerlessHandler();
  return fn(event as any, context as any) as any;
};
