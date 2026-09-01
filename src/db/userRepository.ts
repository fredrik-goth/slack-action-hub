import { getStore } from '@netlify/blobs';
import { credentialService } from '../services/credentialService';

export type Provider = 'google' | 'trello';

export interface User {
  slackUserId: string;
  slackWorkspaceId: string;
  digestEnabled: boolean;
}

export interface GoogleCredentials {
  refreshToken: string;
}

export interface TrelloCredentials {
  apiKey: string;
  token: string;
}

export type ProviderCredentials = GoogleCredentials | TrelloCredentials;

export interface SlackTodoRow {
  id: string;
  slackUserId: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Store ─────────────────────────────────────────────────────────────────────
// Production (Netlify): uses Netlify Blobs, context injected automatically.
// Local dev (npm run dev): falls back to JSON files in ./data/

import fs from 'fs';
import path from 'path';

interface BlobStore {
  get(key: string, opts?: { type?: 'text' | 'json' }): Promise<any>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

// File-based store for local development
const DATA_DIR = path.join(process.cwd(), 'data');

const localStore: BlobStore = {
  async get(key: string, opts?: { type?: 'text' | 'json' }): Promise<any> {
    const file = path.join(DATA_DIR, encodeURIComponent(key));
    try {
      const raw = fs.readFileSync(file, 'utf8');
      return opts?.type === 'json' ? JSON.parse(raw) : raw;
    } catch {
      return null;
    }
  },
  async set(key: string, value: string): Promise<void> {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(path.join(DATA_DIR, encodeURIComponent(key)), value, 'utf8');
  },
  async delete(key: string): Promise<void> {
    try { fs.unlinkSync(path.join(DATA_DIR, encodeURIComponent(key))); } catch {}
  },
};

function db(): BlobStore {
  // Netlify injects NETLIFY=true in deployed functions and netlify dev
  if (process.env.NETLIFY || process.env.NETLIFY_LOCAL) {
    return getStore('action-hub') as unknown as BlobStore;
  }
  // Also allow manual Netlify Blobs via .env (NETLIFY_SITE_ID + NETLIFY_AUTH_TOKEN)
  if (process.env.NETLIFY_SITE_ID && process.env.NETLIFY_AUTH_TOKEN) {
    return getStore({
      name: 'action-hub',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_AUTH_TOKEN,
    }) as unknown as BlobStore;
  }
  // Local dev fallback — data stored in ./data/
  return localStore;
}

// ── Keys ─────────────────────────────────────────────────────────────────────

const K = {
  user:               (id: string)              => `user:${id}`,
  allUsers:           ()                        => `all_users`,
  creds:              (id: string, p: Provider) => `creds:${id}:${p}`,
  connectedProviders: (id: string)              => `connected:${id}`,
  userTodos:          (id: string)              => `todos:${id}`,
  todo:               (id: string)              => `todo:${id}`,
};

// ── Array-set helpers (simulate Redis sets with JSON arrays) ──────────────────

async function arrayAdd(key: string, value: string): Promise<void> {
  const arr: string[] = (await db().get(key, { type: 'json' })) ?? [];
  if (!arr.includes(value)) {
    arr.push(value);
    await db().set(key, JSON.stringify(arr));
  }
}

async function arrayRemove(key: string, value: string): Promise<void> {
  const arr: string[] = (await db().get(key, { type: 'json' })) ?? [];
  await db().set(key, JSON.stringify(arr.filter((v) => v !== value)));
}

async function arrayMembers(key: string): Promise<string[]> {
  return (await db().get(key, { type: 'json' })) ?? [];
}

// ── Users ─────────────────────────────────────────────────────────────────────

export const userRepository = {
  async ensureUser(slackUserId: string, workspaceId = ''): Promise<void> {
    const existing = await db().get(K.user(slackUserId), { type: 'json' });
    if (!existing) {
      await db().set(K.user(slackUserId), JSON.stringify({
        slackUserId,
        slackWorkspaceId: workspaceId,
        digestEnabled: true,
      }));
      await arrayAdd(K.allUsers(), slackUserId);
    }
  },

  async getUser(slackUserId: string): Promise<User | undefined> {
    return (await db().get(K.user(slackUserId), { type: 'json' })) ?? undefined;
  },

  async getAllUsers(): Promise<User[]> {
    const ids = await arrayMembers(K.allUsers());
    if (!ids.length) return [];
    const users = await Promise.all(ids.map((id) => userRepository.getUser(id)));
    return users.filter(Boolean) as User[];
  },

  async getUsersWithDigestEnabled(): Promise<User[]> {
    const all = await userRepository.getAllUsers();
    return all.filter((u) => u.digestEnabled);
  },

  async setDigestEnabled(slackUserId: string, enabled: boolean): Promise<void> {
    const user = await userRepository.getUser(slackUserId);
    if (user) {
      user.digestEnabled = enabled;
      await db().set(K.user(slackUserId), JSON.stringify(user));
    }
  },

  // ── Credentials ────────────────────────────────────────────────────────────

  async setCredentials(slackUserId: string, provider: Provider, credentials: ProviderCredentials): Promise<void> {
    const enc = credentialService.encrypt(JSON.stringify(credentials));
    await db().set(K.creds(slackUserId, provider), enc);
    await arrayAdd(K.connectedProviders(slackUserId), provider);
  },

  async getCredentials<T extends ProviderCredentials>(slackUserId: string, provider: Provider): Promise<T | undefined> {
    const enc = await db().get(K.creds(slackUserId, provider), { type: 'text' });
    if (!enc) return undefined;
    try {
      return JSON.parse(credentialService.decrypt(enc)) as T;
    } catch {
      return undefined;
    }
  },

  async removeCredentials(slackUserId: string, provider: Provider): Promise<void> {
    await db().delete(K.creds(slackUserId, provider));
    await arrayRemove(K.connectedProviders(slackUserId), provider);
  },

  async getConnectedProviders(slackUserId: string): Promise<Provider[]> {
    return (await arrayMembers(K.connectedProviders(slackUserId))) as Provider[];
  },

  // ── Slack Todos ────────────────────────────────────────────────────────────

  async createTodo(
    slackUserId: string,
    title: string,
    opts: { description?: string; priority?: string; dueDate?: string } = {}
  ): Promise<string> {
    const id = `todo_${slackUserId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();
    const todo: SlackTodoRow = {
      id,
      slackUserId,
      title,
      description: opts.description,
      status: 'pending',
      priority: opts.priority ?? 'medium',
      dueDate: opts.dueDate,
      createdAt: now,
      updatedAt: now,
    };
    await db().set(K.todo(id), JSON.stringify(todo));
    await arrayAdd(K.userTodos(slackUserId), id);
    return id;
  },

  async getTodos(slackUserId: string, includeCompleted = false): Promise<SlackTodoRow[]> {
    const ids = await arrayMembers(K.userTodos(slackUserId));
    if (!ids.length) return [];
    const todos = await Promise.all(
      ids.map(async (id) => {
        const raw = await db().get(K.todo(id), { type: 'json' });
        return raw as SlackTodoRow | null;
      })
    );
    return todos
      .filter(Boolean)
      .filter((t) => includeCompleted || t!.status !== 'completed')
      .sort((a, b) => new Date(b!.createdAt).getTime() - new Date(a!.createdAt).getTime()) as SlackTodoRow[];
  },

  async completeTodo(id: string, slackUserId: string): Promise<boolean> {
    const todo = await db().get(K.todo(id), { type: 'json' }) as SlackTodoRow | null;
    if (!todo || todo.slackUserId !== slackUserId) return false;
    todo.status = 'completed';
    todo.updatedAt = new Date().toISOString();
    await db().set(K.todo(id), JSON.stringify(todo));
    return true;
  },

  async deleteTodo(id: string, slackUserId: string): Promise<boolean> {
    const todo = await db().get(K.todo(id), { type: 'json' }) as SlackTodoRow | null;
    if (!todo || todo.slackUserId !== slackUserId) return false;
    await db().delete(K.todo(id));
    await arrayRemove(K.userTodos(slackUserId), id);
    return true;
  },
};
