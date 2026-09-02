import { TaskAggregatorService } from './taskAggregator';
import { userRepository, GoogleCredentials, TrelloCredentials } from '../db/userRepository';
import { GmailProvider } from '../providers/mail/gmailProvider';
import { TrelloProvider } from '../providers/trello/trelloProvider';
import { SlackTodosProvider } from '../providers/slack/slackTodosProvider';
import { AssignmentProvider } from '../providers/slack/assignmentProvider';
import { config } from '../config';

class UserAggregatorRegistry {
  private instances = new Map<string, TaskAggregatorService>();

  /**
   * Returns the TaskAggregatorService for the given Slack user.
   * Builds it from the user's stored credentials if not cached.
   */
  async getForUser(slackUserId: string): Promise<TaskAggregatorService> {
    if (this.instances.has(slackUserId)) {
      return this.instances.get(slackUserId)!;
    }
    return this.build(slackUserId);
  }

  /**
   * Invalidates and rebuilds the aggregator for a user.
   * Call this after the user connects or disconnects a provider.
   */
  invalidate(slackUserId: string): void {
    this.instances.delete(slackUserId);
  }

  private async build(slackUserId: string): Promise<TaskAggregatorService> {
    const providers = [];

    // Google (Gmail + Calendar + Tasks)
    const googleCreds = await userRepository.getCredentials<GoogleCredentials>(slackUserId, 'google');
    if (googleCreds && config.google.clientId && config.google.clientSecret) {
      providers.push(
        new GmailProvider({
          refreshToken: googleCreds.refreshToken,
          clientId: config.google.clientId,
          clientSecret: config.google.clientSecret,
          redirectUri: config.google.redirectUri,
          gmailQuery: config.google.gmailQuery,
        })
      );
    }

    // Trello
    const trelloCreds = await userRepository.getCredentials<TrelloCredentials>(slackUserId, 'trello');
    if (trelloCreds) {
      providers.push(
        new TrelloProvider({ apiKey: trelloCreds.apiKey, token: trelloCreds.token })
      );
    }

    // Slack Todos — always enabled (native, no credentials required)
    providers.push(new SlackTodosProvider(slackUserId));

    // Assignments — always enabled (from #Uppdrag channel watcher)
    providers.push(new AssignmentProvider(slackUserId));

    const aggregator = new TaskAggregatorService(providers);
    this.instances.set(slackUserId, aggregator);
    return aggregator;
  }
}

export const userAggregatorRegistry = new UserAggregatorRegistry();
