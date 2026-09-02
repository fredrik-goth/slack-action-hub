import { TaskProvider } from '../../types/provider';
import { TaskItem } from '../../types/task';
import { userRepository } from '../../db/userRepository';

export class AssignmentProvider implements TaskProvider {
  readonly name = 'Uppdrag (Channel Assignments)';
  readonly source = 'assignment' as const;

  constructor(private slackUserId: string) {}

  isConfigured(): boolean {
    return true;
  }

  async fetchTasks(): Promise<TaskItem[]> {
    const assignments = await userRepository.getAssignments(this.slackUserId);
    const now = new Date();

    return assignments.map((a) => {
      // Build a deep link to the Slack message
      const channelId = a.channelId;
      const tsParts = a.messageTs.replace('.', '');
      const url = `https://slack.com/archives/${channelId}/p${tsParts}`;

      // Trim text for use as description (strip @mentions, limit length)
      const description = a.text.replace(/<@[^>]+>/g, '').trim().slice(0, 200) || undefined;

      return {
        id: a.id,
        source: 'assignment' as const,
        title: `📨 ${a.channelName} assignment`,
        description,
        status: 'pending' as const,
        priority: 'high' as const,
        url,
        metadata: {
          sender: a.postedBy,
          rawId: a.id,
        },
        createdAt: new Date(a.createdAt),
        updatedAt: now,
      };
    });
  }
}
