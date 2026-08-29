import { TaskProvider } from '../types/provider';
import { AggregatedStats, TaskFilter, TaskItem } from '../types/task';
import { TrelloProvider } from '../providers/trello/trelloProvider';
import { GmailProvider } from '../providers/mail/gmailProvider';
import { MockProvider } from '../providers/mock/mockProvider';
import { config } from '../config';

export class TaskAggregatorService {
  private providers: TaskProvider[] = [];
  private cachedTasks: TaskItem[] = [];
  private lastFetchedAt: Date | null = null;
  private cacheTTLMs = 60 * 1000; // 1 minute cache

  constructor() {
    this.initProviders();
  }

  private initProviders(): void {
    const trello = new TrelloProvider();
    const gmail = new GmailProvider();

    if (trello.isConfigured()) {
      this.providers.push(trello);
      console.log('✓ [TaskAggregator] Trello provider active');
    }
    if (gmail.isConfigured()) {
      this.providers.push(gmail);
      console.log('✓ [TaskAggregator] Gmail / Google Tasks provider active');
    }

    // If mock data is enabled or no real providers are configured, load Mock provider
    if (config.useMockData || this.providers.length === 0) {
      this.providers.push(new MockProvider());
      console.log('ℹ [TaskAggregator] Demo/Mock provider active for testing');
    }
  }

  public getProviderStatus(): Array<{ name: string; source: string; configured: boolean }> {
    return this.providers.map((p) => ({
      name: p.name,
      source: p.source,
      configured: p.isConfigured(),
    }));
  }

  public async getTasks(filter?: TaskFilter, forceRefresh = false): Promise<TaskItem[]> {
    const now = new Date();
    const isCacheExpired =
      !this.lastFetchedAt || now.getTime() - this.lastFetchedAt.getTime() > this.cacheTTLMs;

    if (forceRefresh || isCacheExpired || this.cachedTasks.length === 0) {
      await this.refreshTasks();
    }

    return this.applyFilter(this.cachedTasks, filter);
  }

  public async refreshTasks(): Promise<TaskItem[]> {
    console.log('[TaskAggregator] Refreshing tasks from all providers...');
    const allTasks: TaskItem[] = [];

    for (const provider of this.providers) {
      try {
        const tasks = await provider.fetchTasks();
        allTasks.push(...tasks);
      } catch (err) {
        console.error(`[TaskAggregator] Error fetching from provider ${provider.name}:`, err);
      }
    }

    // Sort tasks: Urgent -> High -> Medium -> Low, then by Due Date ascending, completed last
    this.cachedTasks = this.sortTasks(allTasks);
    this.lastFetchedAt = new Date();
    return this.cachedTasks;
  }

  public async completeTask(taskId: string): Promise<boolean> {
    // Find task in cache
    const task = this.cachedTasks.find((t) => t.id === taskId);
    if (!task) return false;

    let success = false;
    for (const provider of this.providers) {
      if (provider.completeTask) {
        const handled = await provider.completeTask(taskId);
        if (handled) {
          success = true;
          break;
        }
      }
    }

    // Optimistically update local cache
    task.status = 'completed';
    task.completedAt = new Date();
    task.updatedAt = new Date();
    return success || true;
  }

  public async snoozeTask(taskId: string, until: Date): Promise<boolean> {
    const task = this.cachedTasks.find((t) => t.id === taskId);
    if (!task) return false;

    for (const provider of this.providers) {
      if (provider.snoozeTask) {
        await provider.snoozeTask(taskId, until);
      }
    }

    task.status = 'snoozed';
    task.snoozedUntil = until;
    task.updatedAt = new Date();
    return true;
  }

  public getStats(tasks: TaskItem[] = this.cachedTasks): AggregatedStats {
    const now = new Date();
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    let pending = 0;
    let dueToday = 0;
    let overdue = 0;
    let completed = 0;

    const bySource = {
      trello: 0,
      gmail: 0,
      google_tasks: 0,
      custom: 0,
    };

    for (const t of tasks) {
      if (t.source in bySource) {
        bySource[t.source as keyof typeof bySource]++;
      } else {
        bySource.custom++;
      }

      if (t.status === 'completed') {
        completed++;
        continue;
      }

      pending++;
      if (t.dueDate) {
        const dueTime = t.dueDate.getTime();
        if (dueTime < now.getTime()) {
          overdue++;
        } else if (dueTime <= endOfToday.getTime()) {
          dueToday++;
        }
      }
    }

    return {
      total: tasks.length,
      pending,
      dueToday,
      overdue,
      completed,
      bySource,
    };
  }

  private applyFilter(tasks: TaskItem[], filter?: TaskFilter): TaskItem[] {
    if (!filter) return tasks;

    return tasks.filter((task) => {
      if (filter.source && filter.source !== 'all' && task.source !== filter.source) {
        return false;
      }
      if (filter.status && filter.status !== 'all' && task.status !== filter.status) {
        return false;
      }
      if (filter.priority && filter.priority !== 'all' && task.priority !== filter.priority) {
        return false;
      }
      if (filter.searchQuery && filter.searchQuery.trim() !== '') {
        const query = filter.searchQuery.toLowerCase();
        const matchesTitle = task.title.toLowerCase().includes(query);
        const matchesDesc = task.description?.toLowerCase().includes(query);
        const matchesBoard = task.metadata?.boardName?.toLowerCase().includes(query);
        const matchesSender = task.metadata?.sender?.toLowerCase().includes(query);
        if (!matchesTitle && !matchesDesc && !matchesBoard && !matchesSender) {
          return false;
        }
      }
      return true;
    });
  }

  private sortTasks(tasks: TaskItem[]): TaskItem[] {
    const priorityWeights = { urgent: 4, high: 3, medium: 2, low: 1 };

    return [...tasks].sort((a, b) => {
      // Completed items go to the bottom
      if (a.status === 'completed' && b.status !== 'completed') return 1;
      if (a.status !== 'completed' && b.status === 'completed') return -1;

      // Sort by priority weight
      const weightA = priorityWeights[a.priority] || 0;
      const weightB = priorityWeights[b.priority] || 0;
      if (weightA !== weightB) return weightB - weightA;

      // Then by due date (nearest first)
      if (a.dueDate && b.dueDate) {
        return a.dueDate.getTime() - b.dueDate.getTime();
      }
      if (a.dueDate && !b.dueDate) return -1;
      if (!a.dueDate && b.dueDate) return 1;

      return b.createdAt.getTime() - a.createdAt.getTime();
    });
  }
}

export const taskAggregator = new TaskAggregatorService();
