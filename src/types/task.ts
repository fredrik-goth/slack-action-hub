export type TaskSource = 'trello' | 'gmail' | 'google_tasks' | 'calendar' | 'custom' | 'assignment';

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'snoozed';

export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low';

export interface TaskItem {
  id: string;
  source: TaskSource;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: Date;
  completedAt?: Date;
  snoozedUntil?: Date;
  url?: string;
  metadata?: {
    boardName?: string;
    listName?: string;
    sender?: string;
    labels?: string[];
    checklistProgress?: {
      completed: number;
      total: number;
    };
    rawId?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskFilter {
  source?: TaskSource | 'all';
  status?: TaskStatus | 'all';
  priority?: TaskPriority | 'all';
  searchQuery?: string;
}

export interface AggregatedStats {
  total: number;
  pending: number;
  dueToday: number;
  overdue: number;
  completed: number;
  bySource: {
    trello: number;
    gmail: number;
    google_tasks: number;
    calendar: number;
    custom: number;
    assignment: number;
  };
}
