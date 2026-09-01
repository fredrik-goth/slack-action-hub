import { TaskProvider } from '../../types/provider';
import { TaskItem, TaskPriority } from '../../types/task';
import { userRepository } from '../../db/userRepository';

export class SlackTodosProvider implements TaskProvider {
  readonly name = 'Slack Todos';
  readonly source = 'custom' as const;

  constructor(private slackUserId: string) {}

  isConfigured(): boolean {
    return true; // Always available — backed by Upstash Redis
  }

  async fetchTasks(): Promise<TaskItem[]> {
    const todos = await userRepository.getTodos(this.slackUserId, false);
    const now = new Date();

    return todos.map((todo): TaskItem => {
      const dueDate = todo.dueDate ? new Date(todo.dueDate) : undefined;
      let priority: TaskPriority = (todo.priority as TaskPriority) || 'medium';

      if (dueDate && priority === 'medium') {
        const diffHours = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60);
        if (diffHours < 0) priority = 'urgent';
        else if (diffHours <= 24) priority = 'high';
      }

      return {
        id: todo.id,
        source: 'custom',
        title: `📌 ${todo.title}`,
        description: todo.description,
        status: todo.status as any,
        priority,
        dueDate,
        metadata: { listName: 'Slack Todos', rawId: todo.id },
        createdAt: new Date(todo.createdAt),
        updatedAt: new Date(todo.updatedAt),
      };
    });
  }

  async completeTask(taskId: string): Promise<boolean> {
    return userRepository.completeTodo(taskId, this.slackUserId);
  }
}
