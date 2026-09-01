# testing-rules.md — Action Hub QA Checklist

> Run this before every release or after any meaningful change.
> Fix all 🔴 Critical issues before pushing to main.
> Report 🟡 Minor issues only if they need a decision.

---

## Output format

```
🔴 CRITICAL | C[N] | [file:line if known] | What is wrong → How to fix it
🟡 MINOR    | M[N] | [file:line if known] | What is wrong → How to fix it
🟢 PASS     | [N]  | Check description
```

End with:
```
X/Y checks passed — N critical, N minor
[Status: ready to ship / fix criticals first]
```

---

## Build checks

### B1 — TypeScript compiles clean
Run `npx tsc --noEmit`. Zero errors.
Severity: 🔴

### B2 — Production build succeeds
Run `npm run build`. Completes without errors.
Severity: 🔴

---

## Code quality checks

### Q1 — No console.log in committed code
Search for `console.log` in all `.ts` files under `src/` and `netlify/`.
`console.error` is allowed for real error paths.
Severity: 🔴

### Q2 — No secrets in the repo
No API keys, tokens, or passwords committed to any file.
`.env` is listed in `.gitignore` and not tracked.
Severity: 🔴

### Q3 — All userRepository calls are awaited
Search for `userRepository.` — every call must have `await` in front of it.
Missing `await` causes silent failures (Promise returned but never resolved).
Severity: 🔴

### Q4 — Registry invalidated after credential changes
Anywhere `setCredentials` or `removeCredentials` is called,
`userAggregatorRegistry.invalidate(userId)` must follow.
Severity: 🔴

### Q5 — No commented-out code blocks
No large blocks of old code left commented out.
Severity: 🟡

---

## Slack behaviour checks

### S1 — App Home loads without error
Open Action Hub in Slack → App Home tab.
No "This app is taking too long to respond" or blank screen.
Severity: 🔴

### S2 — Connect Google flow works end-to-end
Click "Connect Google" → link appears in DM → OAuth completes → home tab updates.
Severity: 🔴

### S3 — Connect Trello flow works end-to-end
Click "Connect Trello" → Step 1 modal (API key) → Step 2 modal (token) → home tab updates.
Severity: 🔴

### S4 — Disconnect removes credentials
Click "Disconnect" on a connected provider → confirm → provider disappears from home tab.
Home tab shows the connect button again.
Severity: 🔴

### S5 — Add Todo works
Click "➕ Add Todo" → fill modal → submit → todo appears in home tab.
Severity: 🔴

### S6 — Complete task works
Click "✅ Done" on any task → task disappears from the pending list.
Severity: 🔴

### S7 — No mock or placeholder data visible
No hardcoded task titles, names, or sample data visible to any user.
Severity: 🔴

### S8 — Each user only sees their own tasks
Two different Slack users should see only their own connected providers and tasks.
Severity: 🔴

### S9 — Snooze works
Click "⏰ Snooze 24h" → task disappears from view until tomorrow.
Severity: 🟡

### S10 — Slash commands respond
`/actions` or `/tasks` → responds with a task summary. Does not time out.
Severity: 🟡

---

## GitHub hygiene checks

### G1 — All work is pushed
`git status` shows clean. Nothing sitting uncommitted locally.
Severity: 🔴

### G2 — CLAUDE.md session log is updated
`## Session log` in `CLAUDE.md` has an entry for today's work.
Severity: 🟡

### G3 — Repo has a description on GitHub
One sentence describing what Action Hub does.
Severity: 🟡

---

## Before deploying to Netlify

### D1 — All env vars are set in Netlify dashboard
Check against `.env.example` — every variable must exist in Netlify → Site settings → Environment variables.
Severity: 🔴

### D2 — Slack Request URL is updated
Event Subscriptions and Interactivity both point to the Netlify function URL.
Severity: 🔴

### D3 — Google redirect URI is updated
Google Cloud Console → OAuth client → Authorized redirect URIs includes the Netlify URL.
Severity: 🔴

### D4 — Socket Mode is disabled in production
api.slack.com/apps → Socket Mode → toggled off.
`SLACK_APP_TOKEN` is not set in Netlify env vars.
Severity: 🔴

---

*Version: 1.0 — August 2026*
