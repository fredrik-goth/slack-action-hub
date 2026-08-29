import { TaskProvider } from '../../types/provider';
import { TaskItem, TaskPriority } from '../../types/task';

export class MockProvider implements TaskProvider {
  readonly name = 'Demo & Mock Provider';
  readonly source = 'custom' as const;

  private mockTasks: TaskItem[] = [];

  constructor() {
    this.initSampleData();
  }

  isConfigured(): boolean {
    return true;
  }

  private initSampleData(): void {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 17, 0, 0);
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const nextWeek = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

    this.mockTasks = [
      // 1. Overdue Trello Card
      {
        id: 'mock_trello_1',
        source: 'trello',
        title: 'Review Q3 Product Roadmap draft with design team',
        description: 'Check wireframes, design system updates, and user journey flows before the team sync.',
        status: 'pending',
        priority: 'urgent',
        dueDate: yesterday,
        url: 'https://trello.com/c/mock-card-1',
        metadata: {
          boardName: 'Product Strategy & Roadmap',
          listName: 'In Review',
          labels: ['Design', 'Q3 Priorities'],
          checklistProgress: { completed: 3, total: 4 },
        },
        createdAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
        updatedAt: now,
      },
      // 2. High Priority Trello Card Due Today
      {
        id: 'mock_trello_2',
        source: 'trello',
        title: 'Finalize Slack App Integration specifications',
        description: 'Define Block Kit Home Tab layout, interactive handlers, and slash command syntax.',
        status: 'pending',
        priority: 'high',
        dueDate: today,
        url: 'https://trello.com/c/mock-card-2',
        metadata: {
          boardName: 'Engineering Sprint 24',
          listName: 'Doing',
          labels: ['Backend', 'Slack'],
          checklistProgress: { completed: 1, total: 3 },
        },
        createdAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
        updatedAt: now,
      },
      // 3. Medium Priority Trello Card
      {
        id: 'mock_trello_3',
        source: 'trello',
        title: 'Prepare presentation deck for executive stakeholder review',
        description: 'Include metric summaries, integration milestones, and user feedback.',
        status: 'pending',
        priority: 'medium',
        dueDate: nextWeek,
        url: 'https://trello.com/c/mock-card-3',
        metadata: {
          boardName: 'Leadership & Ops',
          listName: 'Backlog',
          labels: ['Reporting'],
        },
        createdAt: now,
        updatedAt: now,
      },
      // 4. Urgent Action Email (Gmail)
      {
        id: 'mock_gmail_1',
        source: 'gmail',
        title: '✉️ [Action Required] Contract approval for Cloud hosting renewal',
        description: 'Please review and sign the attached enterprise SLA agreement by end of day.',
        status: 'pending',
        priority: 'urgent',
        dueDate: today,
        url: 'https://mail.google.com',
        metadata: {
          sender: 'Sarah Jenkins <sarah.jenkins@company.com>',
          labels: ['STARRED', 'IMPORTANT', 'Contracts'],
        },
        createdAt: new Date(now.getTime() - 4 * 60 * 60 * 1000),
        updatedAt: now,
      },
      // 5. Starred Email Follow-up (Gmail)
      {
        id: 'mock_gmail_2',
        source: 'gmail',
        title: '✉️ Re: Feedback on Mobile UI prototype and typography scale',
        description: 'Great progress on the prototype! Can we adjust the dark mode accent tokens before tomorrow?',
        status: 'pending',
        priority: 'high',
        dueDate: tomorrow,
        url: 'https://mail.google.com',
        metadata: {
          sender: 'Alex Rivera <alex.design@company.com>',
          labels: ['STARRED', 'Design System'],
        },
        createdAt: new Date(now.getTime() - 8 * 60 * 60 * 1000),
        updatedAt: now,
      },
      // 6. Google Tasks Item
      {
        id: 'mock_gtask_1',
        source: 'google_tasks',
        title: 'Submit monthly expense report and receipt scans',
        description: 'Include conference travel expenses and software subscription invoices.',
        status: 'pending',
        priority: 'medium',
        dueDate: tomorrow,
        url: 'https://tasks.google.com',
        metadata: {
          listName: 'Personal Admin',
        },
        createdAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        updatedAt: now,
      },
      // 7. Completed Item
      {
        id: 'mock_trello_4',
        source: 'trello',
        title: 'Configure GitHub Actions CI/CD workflow pipeline',
        description: 'Automated test suite and lint checks on pull requests.',
        status: 'completed',
        priority: 'medium',
        completedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
        url: 'https://trello.com/c/mock-card-4',
        metadata: {
          boardName: 'Engineering Sprint 24',
          listName: 'Done',
          labels: ['DevOps'],
        },
        createdAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
        updatedAt: now,
      },
    ];
  }

  async fetchTasks(): Promise<TaskItem[]> {
    return [...this.mockTasks];
  }

  async completeTask(taskId: string): Promise<boolean> {
    const task = this.mockTasks.find((t) => t.id === taskId);
    if (task) {
      task.status = 'completed';
      task.completedAt = new Date();
      task.updatedAt = new Date();
      return true;
    }
    return false;
  }

  async snoozeTask(taskId: string, until: Date): Promise<boolean> {
    const task = this.mockTasks.find((t) => t.id === taskId);
    if (task) {
      task.status = 'snoozed';
      task.snoozedUntil = until;
      task.updatedAt = new Date();
      return true;
    }
    return false;
  }
}
