import { TaskItem, TaskSource } from './task';

export interface TaskProvider {
  readonly name: string;
  readonly source: TaskSource;
  isConfigured(): boolean;
  fetchTasks(): Promise<TaskItem[]>;
  completeTask?(taskId: string): Promise<boolean>;
  snoozeTask?(taskId: string, until: Date): Promise<boolean>;
}
