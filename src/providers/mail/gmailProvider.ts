import { google, gmail_v1, tasks_v1, calendar_v3 } from 'googleapis';
import { TaskProvider } from '../../types/provider';
import { TaskItem, TaskPriority } from '../../types/task';
import { config } from '../../config';

export class GmailProvider implements TaskProvider {
  readonly name = 'Google Workspace (Gmail, Calendar, Tasks)';
  readonly source = 'gmail' as const;

  private oauth2Client: any = null;
  private gmail: gmail_v1.Gmail | null = null;
  private tasks: tasks_v1.Tasks | null = null;
  private calendar: calendar_v3.Calendar | null = null;

  constructor() {
    if (config.google.clientId && config.google.clientSecret && config.google.refreshToken) {
      const OAuth2 = google.auth.OAuth2;
      this.oauth2Client = new OAuth2(
        config.google.clientId,
        config.google.clientSecret,
        config.google.redirectUri
      );
      this.oauth2Client.setCredentials({
        refresh_token: config.google.refreshToken,
      });

      this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
      this.tasks = google.tasks({ version: 'v1', auth: this.oauth2Client });
      this.calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
    }
  }

  isConfigured(): boolean {
    const isGoogleConfigured = !!(
      config.google.clientId &&
      config.google.clientSecret &&
      config.google.refreshToken &&
      !config.google.clientId.includes('your-') &&
      !config.google.clientSecret.includes('your-') &&
      !config.google.refreshToken.includes('your-')
    );
    return isGoogleConfigured && !!(this.oauth2Client && (this.gmail || this.tasks || this.calendar));
  }

  async fetchTasks(): Promise<TaskItem[]> {
    if (!this.isConfigured()) {
      return [];
    }

    const items: TaskItem[] = [];
    const now = new Date();

    // 1. Fetch Gmail Starred / Action Items
    if (this.gmail) {
      try {
        const res = await this.gmail.users.messages.list({
          userId: 'me',
          q: config.google.gmailQuery,
          maxResults: 15,
        });

        const messages = res.data.messages || [];
        for (const msg of messages) {
          if (!msg.id) continue;
          try {
            const detail = await this.gmail.users.messages.get({
              userId: 'me',
              id: msg.id,
              format: 'metadata',
              metadataHeaders: ['Subject', 'From', 'Date'],
            });

            const headers = detail.data.payload?.headers || [];
            const subjectHeader = headers.find((h) => h.name?.toLowerCase() === 'subject');
            const fromHeader = headers.find((h) => h.name?.toLowerCase() === 'from');
            const dateHeader = headers.find((h) => h.name?.toLowerCase() === 'date');

            const title = subjectHeader?.value || '(No Subject)';
            const sender = fromHeader?.value || 'Unknown Sender';
            const emailDate = dateHeader?.value ? new Date(dateHeader.value) : new Date();

            items.push({
              id: `gmail_${msg.id}`,
              source: 'gmail',
              title: `✉️ ${title}`,
              description: detail.data.snippet || undefined,
              status: 'pending',
              priority: 'high',
              url: `https://mail.google.com/mail/u/0/#inbox/${detail.data.threadId || msg.id}`,
              metadata: {
                sender,
                labels: detail.data.labelIds || [],
                rawId: msg.id,
              },
              createdAt: emailDate,
              updatedAt: new Date(),
            });
          } catch (msgErr) {
            console.error(`[GmailProvider] Error fetching message ${msg.id}:`, msgErr);
          }
        }
      } catch (gmailErr) {
        console.error('[GmailProvider] Error querying Gmail messages:', gmailErr);
      }
    }

    // 2. Fetch Google Calendar Events (Today and upcoming 48 hours)
    if (this.calendar) {
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

        const events = calRes.data.items || [];
        for (const ev of events) {
          if (!ev.id || !ev.summary) continue;

          const startStr = ev.start?.dateTime || ev.start?.date;
          const startDate = startStr ? new Date(startStr) : undefined;
          let priority: TaskPriority = 'medium';

          if (startDate) {
            const diffHours = (startDate.getTime() - now.getTime()) / (1000 * 60 * 60);
            if (diffHours < 0) priority = 'urgent'; // Currently happening / passed today
            else if (diffHours <= 2) priority = 'urgent'; // Happening soon!
            else if (diffHours <= 24) priority = 'high'; // Today
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
      } catch (calErr) {
        console.error('[GmailProvider] Error querying Google Calendar:', calErr);
      }
    }

    // 3. Fetch Google Tasks
    if (this.tasks) {
      try {
        const tasklistsRes = await this.tasks.tasklists.list({ maxResults: 10 });
        const tasklists = tasklistsRes.data.items || [];

        for (const list of tasklists) {
          if (!list.id) continue;
          const tasksRes = await this.tasks.tasks.list({
            tasklist: list.id,
            showCompleted: false,
            maxResults: 20,
          });

          const taskItems = tasksRes.data.items || [];

          for (const t of taskItems) {
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
              metadata: {
                listName: list.title || 'My Tasks',
                rawId: t.id,
              },
              createdAt: t.updated ? new Date(t.updated) : new Date(),
              updatedAt: new Date(),
            });
          }
        }
      } catch (tasksErr) {
        console.error('[GmailProvider] Error querying Google Tasks:', tasksErr);
      }
    }

    return items;
  }

  async completeTask(taskId: string): Promise<boolean> {
    if (!this.isConfigured()) return false;

    if (taskId.startsWith('gtask_') && this.tasks) {
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

    if (taskId.startsWith('gmail_') && this.gmail) {
      const rawId = taskId.replace(/^gmail_/, '');
      try {
        await this.gmail.users.messages.modify({
          userId: 'me',
          id: rawId,
          requestBody: {
            removeLabelIds: ['STARRED'],
          },
        });
        return true;
      } catch (err) {
        console.error(`[GmailProvider] Error unstarring Gmail message ${rawId}:`, err);
        return false;
      }
    }

    return false;
  }
}
