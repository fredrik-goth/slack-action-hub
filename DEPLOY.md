# Netlify Deployment Plan

## Prerequisites
- GitHub repo with the latest code pushed
- Netlify account (free tier)
- Google Cloud Console access
- Slack app admin access (api.slack.com/apps)

---

## Step 1 — Push to GitHub

```bash
git add -A && git commit -m "Netlify + Netlify Blobs deployment"
git push
```

---

## Step 2 — Connect repo to Netlify

1. Go to [netlify.com](https://netlify.com)
2. Click **"Add new site"** → **"Import from Git"**
3. Pick your GitHub repo
4. Build settings are auto-detected from `netlify.toml`:
   - Build command: `npm run build`
   - Publish directory: `public`
5. Click **Deploy**

---

## Step 3 — Add environment variables in Netlify

Site settings → **Environment variables** → add each of the following:

| Variable | Value |
|---|---|
| `SLACK_BOT_TOKEN` | `xoxb-...` from api.slack.com/apps → OAuth & Permissions |
| `SLACK_SIGNING_SECRET` | from api.slack.com/apps → Basic Information |
| `ENCRYPTION_KEY` | 64-char hex — generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `GOOGLE_CLIENT_ID` | from Google Cloud Console → APIs & Services → Credentials |
| `GOOGLE_CLIENT_SECRET` | same as above |
| `GOOGLE_REDIRECT_URI` | `https://<your-site>.netlify.app/oauth/google/callback` |
| `TRELLO_API_KEY` | from [trello.com/app-key](https://trello.com/app-key) |

> **Note:** No Redis or database credentials needed — storage is handled by Netlify Blobs automatically.

> **Note:** `SLACK_APP_TOKEN` is NOT needed in production — Socket Mode is disabled on Netlify. Only used for local dev.

---

## Step 4 — Update Slack app settings

Go to [api.slack.com/apps](https://api.slack.com/apps) → your Action Hub app:

### Disable Socket Mode
- **Socket Mode** → toggle **off**

### Event Subscriptions
- **Request URL**: `https://<your-site>.netlify.app/slack/events`
- Verify the URL (Netlify must be deployed first)

### Interactivity & Shortcuts
- **Request URL**: `https://<your-site>.netlify.app/slack/events`

### Slash Commands
- For each command (`/actions`, `/tasks`) update the Request URL to:
  `https://<your-site>.netlify.app/slack/events`

---

## Step 5 — Update Google Cloud Console

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. APIs & Services → **Credentials** → your OAuth 2.0 Client
3. Under **Authorized redirect URIs** add:
   ```
   https://<your-site>.netlify.app/oauth/google/callback
   ```
4. Click **Save**

---

## Local development (after Netlify is set up)

Use `netlify dev` instead of `npm run dev` — this gives functions access to Netlify Blobs and the correct environment:

```bash
npm install -g netlify-cli
netlify link        # link to your Netlify site (one-time)
netlify dev         # starts local server with full Netlify environment
```

> Slack still needs to reach your local server. Use [ngrok](https://ngrok.com) or `netlify dev --live` to get a public tunnel URL, then temporarily update the Slack Request URLs to point there.
