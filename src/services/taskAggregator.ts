import { TaskProvider } from '../types/provider';
import { AggregatedStats, TaskFilter, TaskItem } from '../types/task';

export class TaskAggregatorService {
  private cachedTasks: TaskItem[] = [];
  private lastFetchedAt: Date | null = null;
  private readonly cacheTTLMs = 60 * 1000; // 1 minute

  constructor(private providers: TaskProvider[]) {}

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
      !this.lastFetchedAt ||
      now.getTime() - this.lastFetchedAt.getTime() > this.cacheTTLMs;

    if (forceRefresh || isCacheExpired || this.cachedTasks.length === 0) {
      await this.refreshTasks();
    }

    return this.applyFilter(this.cachedTasks, filter);
  }

  public async refreshTasks(): Promise<TaskItem[]> {
    const allTasks: TaskItem[] = [];

    for (const provider of this.providers) {
      try {
        const tasks = await provider.fetchTasks();
        allTasks.push(...tasks);
      } catch (err) {
        console.error(`[TaskAggregator] Error from provider ${provider.name}:`, err);
      }
    }

    this.cachedTasks = this.sortTasks(allTasks);
    this.lastFetchedAt = new Date();
    return this.cachedTasks;
  }

  public async completeTask(taskId: string): Promise<boolean> {
    const task = this.cachedTasks.find((t) => t.id === taskId);
    if (!task) return false;

    for (const provider of this.providers) {
      if (provider.completeTask) {
        const handled = await provider.completeTask(taskId);
        if (handled) break;
      }
    }

    task.status = 'completed';
    task.completedAt = new Date();
    task.updatedAt = new Date();
    return true;
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

    let pending = 0, dueToday = 0, overdue = 0, completed = 0;
    const bySource = { trello: 0, gmail: 0, google_tasks: 0, calendar: 0, custom: 0 };

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
        if (dueTime < now.getTime()) overdue++;
        else if (dueTime <= endOfToday.getTime()) dueToday++;
      }
    }

    return { total: tasks.length, pending, dueToday, overdue, completed, bySource };
  }

  private applyFilter(tasks: TaskItem[], filter?: TaskFilter): TaskItem[] {
    if (!filter) return tasks;

    return tasks.filter((task) => {
      if (filter.source && filter.source !== 'all' && task.source !== filter.source) return false;
      if (filter.status && filter.status !== 'all' && task.status !== filter.status) return false;
      if (filter.priority && filter.priority !== 'all' && task.priority !== filter.priority) return false;
      if (filter.searchQuery?.trim()) {
        const q = filter.searchQuery.toLowerCase();
        if (
          !task.title.toLowerCase().includes(q) &&
          !task.description?.toLowerCase().includes(q) &&
          !task.metadata?.boardName?.toLowerCase().includes(q) &&
          !task.metadata?.sender?.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }

  private sortTasks(tasks: TaskItem[]): TaskItem[] {
    const weights = { urgent: 4, high: 3, medium: 2, low: 1 };
    return [...tasks].sort((a, b) => {
      if (a.status === 'completed' && b.status !== 'completed') return 1;
      if (a.status !== 'completed' && b.status === 'completed') return -1;
      const wA = weights[a.priority] || 0;
      const wB = weights[b.priority] || 0;
      if (wA !== wB) return wB - wA;
      if (a.dueDate && b.dueDate) return a.dueDate.getTime() - b.dueDate.getTime();
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
  }
}
