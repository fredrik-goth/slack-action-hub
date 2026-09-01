import axios from 'axios';
import { TaskProvider } from '../../types/provider';
import { TaskItem, TaskPriority } from '../../types/task';

export interface TrelloProviderCredentials {
  apiKey: string;
  token: string;
  memberId?: string;
}

interface TrelloCard {
  id: string;
  name: string;
  desc: string;
  due: string | null;
  dueComplete: boolean;
  shortUrl: string;
  labels?: Array<{ name: string; color: string }>;
  checklists?: Array<{
    id: string;
    checkItems: Array<{ id: string; state: 'complete' | 'incomplete'; name: string }>;
  }>;
  board?: { name: string };
  list?: { name: string };
}

export class TrelloProvider implements TaskProvider {
  readonly name = 'Trello';
  readonly source = 'trello' as const;

  private readonly baseUrl = 'https://api.trello.com/1';

  constructor(private creds: TrelloProviderCredentials) {}

  isConfigured(): boolean {
    return !!(this.creds.apiKey && this.creds.token);
  }

  async fetchTasks(): Promise<TaskItem[]> {
    if (!this.isConfigured()) return [];

    const memberId = this.creds.memberId || 'me';

    try {
      const response = await axios.get<TrelloCard[]>(
        `${this.baseUrl}/members/${memberId}/cards`,
        {
          params: {
            key: this.creds.apiKey,
            token: this.creds.token,
            filter: 'open',
            attachments: false,
            checklists: 'all',
            board: true,
            board_fields: 'name',
            list: true,
            list_fields: 'name',
          },
          timeout: 10000,
        }
      );

      const now = new Date();

      return response.data.map((card): TaskItem => {
        const dueDate = card.due ? new Date(card.due) : undefined;
        let priority: TaskPriority = 'medium';

        if (dueDate) {
          const diffHours = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60);
          if (diffHours < 0) priority = 'urgent';
          else if (diffHours <= 24) priority = 'high';
        }

        let completedCheckItems = 0;
        let totalCheckItems = 0;
        for (const list of card.checklists || []) {
          for (const item of list.checkItems) {
            totalCheckItems++;
            if (item.state === 'complete') completedCheckItems++;
          }
        }

        return {
          id: `trello_${card.id}`,
          source: 'trello',
          title: card.name,
          description: card.desc || undefined,
          status: card.dueComplete ? 'completed' : 'pending',
          priority,
          dueDate,
          url: card.shortUrl,
          metadata: {
            boardName: card.board?.name,
            listName: card.list?.name,
            labels: card.labels?.map((l) => l.name).filter(Boolean),
            checklistProgress:
              totalCheckItems > 0
                ? { completed: completedCheckItems, total: totalCheckItems }
                : undefined,
            rawId: card.id,
          },
          createdAt: now,
          updatedAt: now,
        };
      });
    } catch (error) {
      console.error('[TrelloProvider] Failed to fetch cards:', error);
      return [];
    }
  }

  async completeTask(taskId: string): Promise<boolean> {
    if (!this.isConfigured()) return false;
    const rawId = taskId.replace(/^trello_/, '');

    try {
      await axios.put(
        `${this.baseUrl}/cards/${rawId}`,
        { dueComplete: true },
        { params: { key: this.creds.apiKey, token: this.creds.token } }
      );
      return true;
    } catch (error) {
      console.error(`[TrelloProvider] Failed to complete card ${rawId}:`, error);
      return false;
    }
  }
}
