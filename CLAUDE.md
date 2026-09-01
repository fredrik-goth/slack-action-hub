# CLAUDE.md — Action Hub

> Read this file at the start of every session.
> For the deployment plan, see DEPLOY.md.
> For the QA checklist, see rules/testing-rules.md.

---

## Session startup — do this first, every session

1. Run `git pull` to get the latest code
2. Read this file fully
3. Check `## Session log` below for context on recent work
4. Then and only then — start building

---

## This product

**Action Hub** is a multi-user Slack app for the Seventyone team.
It aggregates tasks from Gmail, Google Tasks, Google Calendar, Trello, and Slack Todos
into a single App Home dashboard — one per team member, fully self-served.

| Field | Value |
|---|---|
| Status | `building` |
| Repo | `Antigravity` (transfers to `fredrik-goth/product-action-hub` when ready) |
| Hosting | Netlify (functions) + Netlify Blobs (storage) |
| Slack app | Action Hub — api.slack.com/apps |
| Deploy guide | `DEPLOY.md` |

---

## What this is NOT

- Not a web product — there is no frontend, no UI to build
- Not a client-facing tool — internal Seventyone use only
- Not a project management tool — it aggregates existing tasks, it does not create a new system

---

## Guiding principles — follow these always

- **Simple beats complete.** Build the smallest working version first. Do not add features that were not asked for.
- **GitHub is the source of truth.** All config, rules, and code live in this repo.
- **One PR per change.** Every meaningful change goes through a pull request. Never push directly to main.
- **No secrets in code.** All credentials go in `.env` (local) or Netlify environment variables (production). `.env` is gitignored.
- **All userRepository methods are async.** The storage backend is Netlify Blobs — every read/write is a network call. Always `await`.
- **Invalidate the registry after credential changes.** Call `userAggregatorRegistry.invalidate(userId)` whenever a user connects or disconnects a provider, so the next request rebuilds with fresh credentials.

---

## Tech stack — do not deviate without asking

| Layer | Choice |
|---|---|
| Language | TypeScript (strict mode) |
| Runtime | Node.js 22 |
| Slack framework | `@slack/bolt` v3 — Socket Mode locally, HTTP mode on Netlify |
| Storage | Netlify Blobs (`@netlify/blobs`) — one store named `action-hub` |
| Credential encryption | AES-256-CBC via `src/services/credentialService.ts` |
| Google APIs | `googleapis` — OAuth2 per user, app-level client ID/secret |
| Trello | REST API — per-user API key + token |
| Hosting | Netlify Functions (serverless, HTTP mode) |
| Scheduling | Netlify Scheduled Functions (morning digest) |
| Local dev | `netlify dev` — required for Netlify Blobs to work locally |

### What to avoid

- Do not introduce a database (no SQLite, no Postgres, no Redis) — Netlify Blobs is the store
- Do not use Socket Mode in production — HTTP mode only on Netlify
- Do not store credentials unencrypted — always go through `credentialService`
- Do not add a web frontend — this is a Slack-native app

---

## Repository structure

```
Antigravity/
├── CLAUDE.md                          ← this file — read first every session
├── DEPLOY.md                          ← step-by-step Netlify deployment guide
├── rules/
│   └── testing-rules.md              ← QA checklist — run before every release
│
├── netlify/
│   └── functions/
│       ├── slack.ts                  ← HTTP event handler (all Slack events/actions)
│       ├── oauth-google.ts           ← Google OAuth callback
│       └── digest.ts                 ← Scheduled morning digest (cron)
│
└── src/
    ├── index.ts                      ← local dev entry (Socket Mode)
    ├── config.ts                     ← all env vars in one place
    │
    ├── db/
    │   └── userRepository.ts        ← all Netlify Blobs reads/writes
    │
    ├── services/
    │   ├── credentialService.ts     ← AES-256-CBC encrypt/decrypt
    │   ├── taskAggregator.ts        ← combines providers into a task list
    │   ├── userAggregatorRegistry.ts← per-user aggregator cache
    │   └── scheduler.ts             ← local dev digest scheduler (node-cron)
    │
    ├── providers/
    │   ├── mail/gmailProvider.ts    ← Gmail + Google Tasks + Calendar
    │   ├── trello/trelloProvider.ts ← Trello boards and cards
    │   └── slack/slackTodosProvider.ts ← built-in Slack todos
    │
    ├── slack/
    │   ├── actions.ts               ← all Slack action/event handlers
    │   ├── agent.ts                 ← DM and mention handler (natural language)
    │   ├── commands.ts              ← slash commands (/actions, /tasks)
    │   ├── homeTab.ts               ← App Home Block Kit view builder
    │   ├── messages.ts              ← morning digest message builder
    │   └── settings.ts              ← settings blocks + modals
    │
    ├── routes/
    │   └── oauthRouter.ts           ← Google OAuth callback (local dev only)
    │
    └── types/
        ├── task.ts                  ← TaskItem, TaskFilter, AggregatedStats
        └── provider.ts              ← TaskProvider interface
```

---

## Adding a new provider

1. Create `src/providers/[name]/[name]Provider.ts` implementing `TaskProvider`
2. Add credentials type to `src/db/userRepository.ts` (`Provider` union + interface)
3. Wire up in `src/services/userAggregatorRegistry.ts` — fetch creds, push to providers array
4. Add connect/disconnect buttons in `src/slack/settings.ts`
5. Handle connect/disconnect actions in `src/slack/actions.ts`
6. Run `npm run build` — fix all TypeScript errors before committing

---

## Code style

- **Naming:** camelCase for variables and functions, PascalCase for classes, kebab-case for files
- **Imports:** relative paths — no path aliases configured
- **Async:** all `userRepository.*` calls must be `await`ed — they are network requests
- **Comments:** only when the why is not obvious — do not comment what the code does
- **Commits:** short present-tense messages — `"add trello disconnect handler"` not `"added"` or `"adding"`
- **No `console.log`** left in committed code — use `console.error` for real errors only

---

## Mandatory post-build QA — never skip

After any meaningful change, run `rules/testing-rules.md` before committing.
Fix all 🔴 Critical issues before pushing.

---

## What to do when unsure

- If a requirement is ambiguous — ask one clarifying question before proceeding
- If a change touches the tech stack — flag it and wait for confirmation
- If a file already exists — read it fully before editing
- If this is a new session — re-read this file and the session log below

---

## Session log

| Date | What happened |
|---|---|
| 2026-08-30 | Scaled from single-user to multi-user. Per-user credential storage with AES-256 encryption. Google OAuth flow, Trello 2-step modal. App Home dashboard with filter, stats, settings. |
| 2026-08-30 | UX pass: stripHtml(), relativeDate(), cleaner task cards, no mock data. |
| 2026-08-30 | Migrated storage from SQLite → Upstash Redis → Netlify Blobs. All userRepository methods now async. |
| 2026-08-31 | Created Netlify functions (slack.ts, oauth-google.ts, digest.ts), netlify.toml, DEPLOY.md. Netlify deployment pending. |
