import { HomeView, KnownBlock } from '@slack/bolt';
import { AggregatedStats, TaskFilter, TaskItem } from '../types/task';
import { Provider } from '../db/userRepository';
import { buildSettingsBlocks } from './settings';

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripHtml(text: string): string {
  return text
    .replace(/<\/(p|li|div|br|tr)>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanTitle(title: string): string {
  // Strip leading source emojis added by providers (📌, 📅, ✉️, etc.)
  return title.replace(/^[\p{Emoji}\s]+/u, '').trim() || title;
}

function relativeDate(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const diffDays = Math.round((dateDay.getTime() - today.getTime()) / 86400000);

  if (diffDays < -1)  return `${Math.abs(diffDays)}d overdue`;
  if (diffDays === -1) return `Yesterday`;
  if (diffDays === 0)  return `Today ${time}`;
  if (diffDays === 1)  return `Tomorrow ${time}`;
  if (diffDays < 7)   return `${date.toLocaleDateString([], { weekday: 'short' })} ${time}`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function priorityDot(task: TaskItem): string {
  const isOverdue = task.dueDate && task.dueDate.getTime() < Date.now();
  if (isOverdue || task.priority === 'urgent') return '🔴';
  if (task.priority === 'high')               return '🟡';
  if (task.priority === 'medium')             return '🔵';
  return '⚪';
}

function sourceIcon(task: TaskItem): string {
  switch (task.source) {
    case 'trello':       return '🏷️';
    case 'gmail':        return '✉️';
    case 'google_tasks': return '📋';
    case 'calendar':     return '📅';
    case 'assignment':   return '📨';
    default:             return '📌';
  }
}

function sourceLabel(task: TaskItem): string {
  switch (task.source) {
    case 'trello':
      return `Trello${task.metadata?.boardName ? ` · ${task.metadata.boardName}` : ''}${task.metadata?.listName ? ` › ${task.metadata.listName}` : ''}`;
    case 'gmail':
      return `Gmail${task.metadata?.sender ? ` · ${task.metadata.sender.replace(/<[^>]+>/g, '').split('<')[0].trim()}` : ''}`;
    case 'google_tasks':
      return `Tasks${task.metadata?.listName ? ` · ${task.metadata.listName}` : ''}`;
    case 'calendar':
      return ''; // icon alone is enough — no need to repeat "Calendar"
    case 'assignment':
      return `Uppdrag${task.metadata?.sender ? ` · from ${task.metadata.sender}` : ''}`;
    default:
      return 'Slack Todo';
  }
}

// ── Greeting ──────────────────────────────────────────────────────────────────

function greetingText(name?: string): string {
  const hour = new Date().getHours();
  const salutation =
    hour < 12 ? '☀️  Good morning' :
    hour < 17 ? '🌤️  Good afternoon' :
                '🌙  Good evening';
  return name ? `${salutation}, ${name}` : salutation;
}

function todayLabel(): string {
  return new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

function statsLine(stats: AggregatedStats): string {
  const parts: string[] = [];
  if (stats.overdue > 0)   parts.push(`🔴 ${stats.overdue} overdue`);
  if (stats.dueToday > 0)  parts.push(`⏳ ${stats.dueToday} due today`);
  if (stats.completed > 0) parts.push(`✅ ${stats.completed} done`);
  if (parts.length === 0)  return `${stats.total} task${stats.total !== 1 ? 's' : ''}`;
  return parts.join('  ·  ');
}

// ── Calendar awareness ────────────────────────────────────────────────────────

function getImminent(tasks: TaskItem[]): { happening: TaskItem | null; upNext: TaskItem | null } {
  const nowMs = Date.now();
  const calEvents = tasks
    .filter(t => t.source === 'calendar' && t.status !== 'completed' && t.dueDate)
    .sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime());

  const happening = calEvents.find(t => {
    const start = t.dueDate!.getTime();
    return start <= nowMs && start >= nowMs - 90 * 60 * 1000;
  }) ?? null;

  const upNext = calEvents.find(t => {
    const start = t.dueDate!.getTime();
    return start > nowMs && start <= nowMs + 60 * 60 * 1000;
  }) ?? null;

  return { happening, upNext };
}

// ── Focus / Later split ───────────────────────────────────────────────────────

function getFocusTasks(tasks: TaskItem[]): TaskItem[] {
  const nowMs = Date.now();
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

  return tasks
    .filter(t => t.status !== 'completed' && t.source !== 'calendar')
    .filter(t => {
      const isOverdue  = t.dueDate && t.dueDate.getTime() < nowMs;
      const isDueToday = t.dueDate && t.dueDate <= todayEnd;
      const isUrgent   = t.priority === 'urgent' || t.priority === 'high';
      return isOverdue || isDueToday || isUrgent;
    })
    .sort((a, b) => {
      const aOver = a.dueDate && a.dueDate.getTime() < nowMs ? 0 : 1;
      const bOver = b.dueDate && b.dueDate.getTime() < nowMs ? 0 : 1;
      if (aOver !== bOver) return aOver - bOver;
      return (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2);
    })
    .slice(0, 5);
}

// ── Task card ─────────────────────────────────────────────────────────────────

function buildTaskCard(task: TaskItem, isLast: boolean): KnownBlock[] {
  const blocks: KnownBlock[] = [];
  const nowMs = Date.now();

  const title = cleanTitle(task.title);
  const dot   = task.source === 'calendar' ? '' : priorityDot(task);
  const icon  = sourceIcon(task);
  const src   = sourceLabel(task);

  let dateStr = '';
  if (task.dueDate) {
    const isOverdue = task.dueDate.getTime() < nowMs;
    dateStr = isOverdue
      ? `  ⚠️ ${relativeDate(task.dueDate)}`
      : `  🗓 ${relativeDate(task.dueDate)}`;
  }

  const checklist = task.metadata?.checklistProgress
    ? `  ☑️ ${task.metadata.checklistProgress.completed}/${task.metadata.checklistProgress.total}`
    : '';

  let desc = '';
  if (task.description) {
    const clean = stripHtml(task.description);
    if (clean) desc = `\n_${clean.length > 90 ? `${clean.slice(0, 90)}…` : clean}_`;
  }

  const metaLine = [src ? `${icon}  ${src}` : icon, dateStr.trim(), checklist].filter(Boolean).join('  ');

  blocks.push({
    type: 'section',
    block_id: `task_${task.id.slice(0, 50)}`,
    text: {
      type: 'mrkdwn',
      text: `${dot ? `${dot}  ` : ''}*${title}*${desc}\n${metaLine}`,
    },
    accessory: task.url
      ? {
          type: 'button',
          action_id: `open_${task.id.slice(0, 30)}`,
          text: { type: 'plain_text', text: 'Open ↗', emoji: true },
          url: task.url,
        }
      : undefined,
  });

  if (task.source === 'assignment') {
    blocks.push({
      type: 'actions',
      block_id: `act_${task.id.slice(0, 50)}`,
      elements: [
        {
          type: 'button',
          action_id: 'assignment_keep',
          text: { type: 'plain_text', text: '✅  Keep', emoji: true },
          style: 'primary',
          value: task.id,
        },
        {
          type: 'button',
          action_id: 'assignment_remove',
          text: { type: 'plain_text', text: '🗑  Remove', emoji: true },
          style: 'danger',
          value: task.id,
        },
      ],
    });
  } else {
    blocks.push({
      type: 'actions',
      block_id: `act_${task.id.slice(0, 50)}`,
      elements: [
        {
          type: 'button',
          action_id: 'action_complete_task',
          text: { type: 'plain_text', text: '✅  Done', emoji: true },
          style: 'primary',
          value: task.id,
        },
        {
          type: 'button',
          action_id: 'action_snooze_task',
          text: { type: 'plain_text', text: '⏰  Snooze 24h', emoji: true },
          value: task.id,
        },
      ],
    });
  }

  if (!isLast) blocks.push({ type: 'divider' });

  return blocks;
}

// ── Main builder ──────────────────────────────────────────────────────────────

export function buildHomeTabView(
  tasks: TaskItem[],
  stats: AggregatedStats,
  filter?: TaskFilter,
  providerStatus?: Array<{ name: string; configured: boolean }>,
  slackUserId?: string,
  isNewUser?: boolean,
  connectedProviders?: Provider[],
  displayName?: string
): HomeView {
  const blocks: KnownBlock[] = [];
  const activeSource = filter?.source || 'all';

  // ── Greeting + date ────────────────────────────────────────────────────────
  blocks.push({
    type: 'header',
    text: { type: 'plain_text', text: greetingText(displayName), emoji: true },
  });

  blocks.push({
    type: 'context',
    elements: [{
      type: 'mrkdwn',
      text: `${todayLabel()}    ${statsLine(stats)}`,
    }],
  });

  // ── Onboarding banner ──────────────────────────────────────────────────────
  if (isNewUser) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*👋  Welcome to Action Hub!*\nConnect your tools below to get started. Slack Todos work right away — no setup needed.',
      },
    });
  }

  // ── Happening now / Up next ────────────────────────────────────────────────
  const { happening, upNext } = getImminent(tasks);
  const imminentEvent = happening ?? upNext;

  if (imminentEvent) {
    blocks.push({ type: 'divider' });

    const nowMs = Date.now();
    const isNow = !!happening;
    const label = isNow ? '🔴  *Happening now*' : '📅  *Up next*';
    const timeStr = imminentEvent.dueDate
      ? imminentEvent.dueDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '';
    const minutesUntil = !isNow && upNext
      ? Math.round((upNext.dueDate!.getTime() - nowMs) / 60000)
      : null;
    const timeMeta = minutesUntil !== null
      ? `_In ${minutesUntil} min · ${timeStr}_`
      : `_${timeStr}_`;

    const eventTitle = cleanTitle(imminentEvent.title);

    blocks.push({
      type: 'section',
      block_id: 'imminent_event',
      text: {
        type: 'mrkdwn',
        text: `${label}\n*${eventTitle}*   ${timeMeta}`,
      },
      accessory: imminentEvent.url
        ? {
            type: 'button',
            action_id: `open_cal_${imminentEvent.id.slice(0, 28)}`,
            text: { type: 'plain_text', text: isNow ? 'Join ↗' : 'Open ↗', emoji: true },
            style: isNow ? 'primary' : undefined,
            url: imminentEvent.url,
          }
        : undefined,
    });
  }

  // ── Source filter row ──────────────────────────────────────────────────────
  blocks.push({ type: 'divider' });

  blocks.push({
    type: 'actions',
    block_id: 'filter_block',
    elements: [
      { type: 'button', action_id: 'filter_source_all',      text: { type: 'plain_text', text: `All (${stats.total})`,                     emoji: true }, style: activeSource === 'all'          ? 'primary' : undefined, value: 'all' },
      { type: 'button', action_id: 'filter_source_trello',   text: { type: 'plain_text', text: `🏷️ Trello (${stats.bySource.trello})`,      emoji: true }, style: activeSource === 'trello'       ? 'primary' : undefined, value: 'trello' },
      { type: 'button', action_id: 'filter_source_gmail',    text: { type: 'plain_text', text: `✉️ Gmail (${stats.bySource.gmail})`,        emoji: true }, style: activeSource === 'gmail'        ? 'primary' : undefined, value: 'gmail' },
      { type: 'button', action_id: 'filter_source_gtasks',   text: { type: 'plain_text', text: `📋 Tasks (${stats.bySource.google_tasks})`, emoji: true }, style: activeSource === 'google_tasks' ? 'primary' : undefined, value: 'google_tasks' },
      { type: 'button', action_id: 'filter_source_calendar', text: { type: 'plain_text', text: `📅 Calendar (${stats.bySource.calendar})`,  emoji: true }, style: activeSource === 'calendar'     ? 'primary' : undefined, value: 'calendar' },
      { type: 'button', action_id: 'filter_source_todos',    text: { type: 'plain_text', text: `📌 Todos (${stats.bySource.custom})`,       emoji: true }, style: activeSource === 'custom'       ? 'primary' : undefined, value: 'custom' },
    ],
  });

  blocks.push({ type: 'divider' });

  // ── Task list ──────────────────────────────────────────────────────────────
  const pending = tasks.filter(t => t.status !== 'completed');

  if (activeSource === 'all') {
    // Split into Focus (urgent/overdue/due today) and Later
    const focusTasks = getFocusTasks(tasks);
    const focusIds   = new Set(focusTasks.map(t => t.id));
    const laterTasks = pending.filter(t => !focusIds.has(t.id) && t.source !== 'calendar');

    // Focus section
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: focusTasks.length > 0
          ? '*🎯  Focus*   _overdue · due today · high priority_'
          : '*🎯  Focus*',
      },
    });

    if (focusTasks.length === 0) {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: '🎉  *All caught up!*  No overdue or high-priority items.' },
      });
    } else {
      focusTasks.forEach((task, i) =>
        blocks.push(...buildTaskCard(task, i === focusTasks.length - 1))
      );
    }

    // Later section
    if (laterTasks.length > 0) {
      blocks.push({ type: 'divider' });
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*📋  Later*   _${laterTasks.length} item${laterTasks.length !== 1 ? 's' : ''}_`,
        },
      });

      const visibleLater = laterTasks.slice(0, 8);
      visibleLater.forEach((task, i) =>
        blocks.push(...buildTaskCard(task, i === visibleLater.length - 1))
      );

      if (laterTasks.length > 8) {
        blocks.push({
          type: 'context',
          elements: [{
            type: 'mrkdwn',
            text: `_+ ${laterTasks.length - 8} more — use the source filters above to browse_`,
          }],
        });
      }
    }
  } else {
    // Filtered view — flat list with source header
    const sourceNames: Record<string, string> = {
      trello: '🏷️  Trello',
      gmail: '✉️  Gmail',
      google_tasks: '📋  Google Tasks',
      calendar: '📅  Calendar',
      custom: '📌  Slack Todos',
      assignment: '📨  Uppdrag',
    };
    const sourceName = sourceNames[activeSource] ?? activeSource;

    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*${sourceName}*   _${pending.length} item${pending.length !== 1 ? 's' : ''}_` },
    });

    if (pending.length === 0) {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: '🎉  Nothing pending in this filter.' },
      });
    } else {
      pending.forEach((task, i) =>
        blocks.push(...buildTaskCard(task, i === pending.length - 1))
      );
    }
  }

  // ── Completed summary ──────────────────────────────────────────────────────
  if (stats.completed > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: `✅  *${stats.completed}* task${stats.completed !== 1 ? 's' : ''} completed today`,
      }],
    });
  }

  // ── Action row ─────────────────────────────────────────────────────────────
  blocks.push({ type: 'divider' });
  blocks.push({
    type: 'actions',
    block_id: 'action_controls',
    elements: [
      {
        type: 'button',
        action_id: 'action_refresh_tasks',
        text: { type: 'plain_text', text: '🔄  Sync Now', emoji: true },
        value: 'refresh',
      },
      {
        type: 'button',
        action_id: 'settings_add_todo',
        text: { type: 'plain_text', text: '➕  Add Todo', emoji: true },
        style: 'primary',
        value: 'add_todo',
      },
    ],
  });

  // ── Settings / Connections ─────────────────────────────────────────────────
  if (slackUserId) {
    blocks.push(...buildSettingsBlocks(slackUserId, connectedProviders));
  }

  return { type: 'home', blocks };
}
