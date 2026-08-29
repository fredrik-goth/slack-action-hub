# ⚡ Action Hub: Slack-Native Task & Mail Agent

> An intelligent **Slack Agent** that automatically collects, prioritizes, and presents all your actionable tasks from **Gmail / Google Tasks** and **Trello** directly inside **Slack**.

No browser or extra web app needed—**Slack is your unified command center**.

---

## 🌟 How It Works in Slack

### 1. 🤖 Conversational DM Assistant
Chat directly with the **Action Hub Agent** in a 1-on-1 Slack DM or `@mention` in any channel:
- `What are my urgent tasks today?` ➔ Returns prioritized Block Kit action cards with due dates.
- `Show my Trello cards` ➔ Displays open cards across all boards with checklist subtask progress.
- `Any actionable emails?` ➔ Lists starred or action-labeled Gmail threads with sender details.
- `Summary` or `Stats` ➔ Produces an executive status breakdown.
- `Sync my tasks` ➔ Instantly forces a live re-sync from Trello and Gmail.
- `Complete <task name>` ➔ Marks the task done across your tools.

### 2. 📱 Interactive Slack App Home Tab (The Visual Canvas)
Open the **Action Hub** App Home tab in Slack for a full visual dashboard:
- **Visual KPI Callouts**: Real-time counters for *Total Actions*, *Overdue/Urgent 🚨*, *Due Today ⏳*, and *Completed ✅*.
- **One-Click Source Filters**: Filter instantly by `All`, `🏷️ Trello`, `✉️ Gmail`, or `📋 Google Tasks`.
- **Interactive Action Buttons**: Complete tasks (`✅ Done`), snooze (`⏰ Snooze 24h`), or open directly in Trello/Gmail (`🔗 Open`).
- **One-Click Refresh**: `🔄 Sync Now` button with live visual updates.

### 3. ☀️ Proactive Daily Morning Briefing
Configurable daily cron job (default: 9:00 AM weekdays) sending you a morning DM summary with your top priority actions for the day.

### 4. ⚡ Slash Commands
Use `/actions` or `/tasks` in any conversation for quick on-demand summaries.

---

## 🚀 Quick Setup Guide

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/fredrik-goth/slack-action-hub.git
cd slack-action-hub
npm install
```

### 2. Configure Environment

Copy the `.env.example` file:

```bash
cp .env.example .env
```

*(By default, `USE_MOCK_DATA=true` is enabled so you can launch the Slack agent immediately with realistic sample tasks).*

---

## ⚙️ Connecting Your Live Services

### 1. 🤖 Slack App Setup (Socket Mode)

1. Go to [api.slack.com/apps](https://api.slack.com/apps) -> **Create New App** -> **From scratch**.
2. Name your app `Action Hub` and choose your workspace.
3. **Enable Socket Mode**:
   - In the left sidebar, click **Socket Mode** and toggle **Enable Socket Mode** to **ON**.
   - Create an App-level Token with the `connections:write` scope.
   - Copy this token (starts with `xapp-`) into `.env` as `SLACK_APP_TOKEN`.
4. **Configure Bot Permissions**:
   - Go to **OAuth & Permissions**. Under **Bot Token Scopes**, add:
     - `chat:write`
     - `commands`
     - `app_mentions:read`
     - `im:history` (to read DMs sent to the bot)
     - `im:write`
     - `users:read`
   - Click **Install to Workspace** and copy the **Bot User OAuth Token** (starts with `xoxb-`) into `.env` as `SLACK_BOT_TOKEN`.
5. **Get Signing Secret**:
   - In **Basic Information** -> copy **Signing Secret** into `.env` as `SLACK_SIGNING_SECRET`.
6. **Enable App Home & Messages**:
   - In **App Home**, toggle **Home Tab** to **ON**.
   - Under **Show Tabs**, check **Messages Tab** and check *"Allow users to send Slash commands and messages from the messages tab"*.
7. **Enable Event Subscriptions**:
   - In **Event Subscriptions**, toggle **Enable Events** to **ON**.
   - Under **Subscribe to bot events**, add `message.im` and `app_mention`.
8. **Create Slash Commands**:
   - In **Slash Commands**, create `/actions` and `/tasks`.

---

### 2. 🏷️ Connecting Trello (All Member Boards)

1. Visit [trello.com/power-ups/admin](https://trello.com/power-ups/admin) and generate an API Key.
2. Copy the key to `TRELLO_API_KEY` in `.env`.
3. Generate a Token via:
   ```
   https://trello.com/1/authorize?expiration=never&scope=read,write&response_type=token&key=YOUR_API_KEY
   ```
4. Copy the token into `TRELLO_TOKEN` in `.env`.

---

### 3. ✉️ Connecting Gmail & Google Tasks

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Enable **Gmail API** and **Google Tasks API**.
3. Create OAuth 2.0 Client credentials and copy `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REFRESH_TOKEN` into `.env`.

---

## 🏃 Running the Agent

```bash
# Run tests
npm test

# Start the Slack Agent in development
npm run dev

# Or build & run in production
npm run build
npm start
```

Once running, open Slack, navigate to the **Action Hub** App Home or send a DM to start interacting with your unified task assistant!

---

## 📜 License

MIT License © Fredrik Goth
