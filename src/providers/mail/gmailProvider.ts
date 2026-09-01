import { google, gmail_v1, tasks_v1, calendar_v3 } from 'googleapis';
import { TaskProvider } from '../../types/provider';
import { TaskItem, TaskPriority } from '../../types/task';

export interface GoogleProviderCredentials {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  gmailQuery: string;
}

export class GmailProvider implements TaskProvider {
  readonly name = 'Google Workspace (Gmail, Calendar, Tasks)';
  readonly source = 'gmail' as const;

  private oauth2Client: any;
  private gmail: gmail_v1.Gmail;
  private tasks: tasks_v1.Tasks;
  private calendar: calendar_v3.Calendar;

  constructor(private creds: GoogleProviderCredentials) {
    const OAuth2 = google.auth.OAuth2;
    this.oauth2Client = new OAuth2(
      creds.clientId,
      creds.clientSecret,
      creds.redirectUri
    );
    this.oauth2Client.setCredentials({ refresh_token: creds.refreshToken });
    this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
    this.tasks = google.tasks({ version: 'v1', auth: this.oauth2Client });
    this.calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
  }

  isConfigured(): boolean {
    return !!(this.creds.refreshToken && this.creds.clientId && this.creds.clientSecret);
  }

  async fetchTasks(): Promise<TaskItem[]> {
    if (!this.isConfigured()) return [];

    const items: TaskItem[] = [];
    const now = new Date();

    // 1. Gmail starred / action items
    try {
      const res = await this.gmail.users.messages.list({
        userId: 'me',
        q: this.creds.gmailQuery,
        maxResults: 15,
      });

      for (const msg of res.data.messages || []) {
        if (!msg.id) continue;
        try {
          const detail = await this.gmail.users.messages.get({
            userId: 'me',
            id: msg.id,
            format: 'metadata',
            metadataHeaders: ['Subject', 'From', 'Date'],
          });

          const headers = detail.data.payload?.headers || [];
          const get = (name: string) =>
            headers.find((h) => h.name?.toLowerCase() === name)?.value || '';

          items.push({
            id: `gmail_${msg.id}`,
            source: 'gmail',
            title: `✉️ ${get('subject') || '(No Subject)'}`,
            description: detail.data.snippet || undefined,
            status: 'pending',
            priority: 'high',
            url: `https://mail.google.com/mail/u/0/#inbox/${detail.data.threadId || msg.id}`,
            metadata: {
              sender: get('from') || 'Unknown Sender',
              labels: detail.data.labelIds || [],
              rawId: msg.id,
            },
            createdAt: get('date') ? new Date(get('date')) : now,
            updatedAt: now,
          });
        } catch (err) {
          console.error(`[GmailProvider] Error fetching message ${msg.id}:`, err);
        }
      }
    } catch (err) {
      console.error('[GmailProvider] Error querying Gmail:', err);
    }

    // 2. Google Calendar events (next 48h)
    try {
      const timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const timeMax = new Date(now.getTime() + 48 * 60 * 60 * 1000);

      const calRes = await this.calendar.events.list({
        calendarId: 'primary',
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 15,
      });

      for (const ev of calRes.data.items || []) {
        if (!ev.id || !ev.summary) continue;

        // Skip all-day events (no specific time) — birthdays, holidays, block events
        if (!ev.start?.dateTime) continue;

        const startStr = ev.start?.dateTime;
        const startDate = startStr ? new Date(startStr) : undefined;
        let priority: TaskPriority = 'medium';

        if (startDate) {
          const diffHours = (startDate.getTime() - now.getTime()) / (1000 * 60 * 60);
          if (diffHours < 0 || diffHours <= 2) priority = 'urgent';
          else if (diffHours <= 24) priority = 'high';
        }

        items.push({
          id: `cal_${ev.id}`,
          source: 'calendar',
          title: `📅 ${ev.summary}`,
          description: ev.description || ev.location || undefined,
          status: 'pending',
          priority,
          dueDate: startDate,
          url: ev.htmlLink || ev.hangoutLink || 'https://calendar.google.com',
          metadata: {
            sender: ev.organizer?.displayName || ev.organizer?.email,
            rawId: ev.id,
          },
          createdAt: now,
          updatedAt: now,
        });
      }
    } catch (err) {
      console.error('[GmailProvider] Error querying Calendar:', err);
    }

    // 3. Google Tasks
    try {
      const tasklistsRes = await this.tasks.tasklists.list({ maxResults: 10 });
      for (const list of tasklistsRes.data.items || []) {
        if (!list.id) continue;
        const tasksRes = await this.tasks.tasks.list({
          tasklist: list.id,
          showCompleted: false,
          maxResults: 20,
        });

        for (const t of tasksRes.data.items || []) {
          if (!t.id || !t.title) continue;
          const dueDate = t.due ? new Date(t.due) : undefined;
          let priority: TaskPriority = 'medium';
          if (dueDate) {
            const diffHours = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60);
            if (diffHours < 0) priority = 'urgent';
            else if (diffHours <= 24) priority = 'high';
          }

          items.push({
            id: `gtask_${t.id}`,
            source: 'google_tasks',
            title: t.title,
            description: t.notes || undefined,
            status: t.status === 'completed' ? 'completed' : 'pending',
            priority,
            dueDate,
            url: 'https://tasks.google.com',
            metadata: { listName: list.title || 'My Tasks', rawId: t.id },
            createdAt: t.updated ? new Date(t.updated) : now,
            updatedAt: now,
          });
        }
      }
    } catch (err) {
      console.error('[GmailProvider] Error querying Google Tasks:', err);
    }

    return items;
  }

  async completeTask(taskId: string): Promise<boolean> {
    if (!this.isConfigured()) return false;

    if (taskId.startsWith('gtask_')) {
      const rawId = taskId.replace(/^gtask_/, '');
      try {
        await this.tasks.tasks.patch({
          tasklist: '@default',
          task: rawId,
          requestBody: { status: 'completed' },
        });
        return true;
      } catch (err) {
        console.error(`[GmailProvider] Error completing Google Task ${rawId}:`, err);
        return false;
      }
    }

    if (taskId.startsWith('gmail_')) {
      const rawId = taskId.replace(/^gmail_/, '');
      try {
        await this.gmail.users.messages.modify({
          userId: 'me',
          id: rawId,
          requestBody: { removeLabelIds: ['STARRED'] },
        });
        return true;
      } catch (err) {
        console.error(`[GmailProvider] Error unstarring message ${rawId}:`, err);
        return false;
      }
    }

    return false;
  }
}
