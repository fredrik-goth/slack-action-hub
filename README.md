# ⚡ Action Hub: Unified Slack App & Visual Dashboard for Mail & Trello

> Aggregate all your actionable items from **Gmail / Google Tasks** and **Trello** into one unified, interactive command center inside **Slack** and on a dedicated **Visual Web Dashboard**.

---

## 🌟 Key Features

1. **📱 Slack App Home Tab**: Full-page interactive dashboard inside Slack displaying metrics, priority badges, and quick-filter tabs (`All`, `🏷️ Trello`, `✉️ Gmail`, `📋 Google Tasks`).
2. **⚡ Interactive Actions**: One-click **Complete** (`✅ Done`), **Snooze (24h)**, and **Deep-link** buttons directly on Slack task cards.
3. **📊 Visual Web Dashboard**: Real-time browser interface (`http://localhost:3000`) with KPI metrics, live filters, search, and checklist progress bars.
4. **☀️ Scheduled Morning Briefing**: Daily scheduled Slack DM digest summarizing urgent and due-today actions.
5. **💬 Slash Commands**: Use `/actions` or `/tasks` in any Slack channel for instant summaries and quick syncs.
6. **🔌 Socket Mode**: Runs locally without requiring ngrok or exposing public webhook URLs.
7. **🧪 Demo/Mock Mode**: Pre-loaded with realistic sample data for instant out-of-the-box testing.

---

## 🚀 Quick Start (Testing Locally)

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/fredrik-goth/slack-action-hub.git
cd slack-action-hub
npm install
```

### 2. Configure Environment

Copy the example configuration file:

```bash
cp .env.example .env
```

*(By default, `USE_MOCK_DATA=true` is enabled, allowing you to launch the app immediately and experience the visual dashboard without configuring external API keys first).*

### 3. Run the Application

```bash
# Start in development mode (Web Dashboard + Slack Bot)
npm run dev

# Or run tests
npm test
```

Open **`http://localhost:3000`** in your web browser to explore the visual task dashboard!

---

## ⚙️ Configuration & Integration Guides

### 1. 🤖 Setting Up the Slack App (Socket Mode)

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and click **Create New App** -> **From scratch**.
2. Name your app `Action Hub` and choose your Slack workspace.
3. **Enable Socket Mode**:
   - Go to **Socket Mode** in the left sidebar and toggle **Enable Socket Mode** to **ON**.
   - Create an App-level Token with the scope `connections:write` and name it `socket-token`.
   - Copy this token (starts with `xapp-`) and paste it into `.env` as `SLACK_APP_TOKEN`.
4. **Configure Bot Permissions**:
   - Navigate to **OAuth & Permissions** in the sidebar.
   - Under **Bot Token Scopes**, add:
     - `chat:write`
     - `commands`
     - `app_mentions:read`
     - `users:read`
   - Scroll up and click **Install to Workspace**.
   - Copy the **Bot User OAuth Token** (starts with `xoxb-`) into `.env` as `SLACK_BOT_TOKEN`.
5. **Get Signing Secret**:
   - Go to **Basic Information** -> **App Credentials** -> copy **Signing Secret** into `.env` as `SLACK_SIGNING_SECRET`.
6. **Enable App Home**:
   - Go to **App Home** in the sidebar.
   - Under **Show Tabs**, toggle **Home Tab** to **ON**.
7. **Create Slash Commands**:
   - Go to **Slash Commands** -> click **Create New Command**:
     - Command: `/actions`
     - Short Description: `Show your unified actions from Mail and Trello`
   - Repeat for `/tasks` if desired.

---

### 2. 🏷️ Connecting Trello

1. Log into Trello and visit [trello.com/power-ups/admin](https://trello.com/power-ups/admin).
2. Create a new Power-Up / API Key.
3. Copy your **API Key** into `.env` as `TRELLO_API_KEY`.
4. Generate a Token by clicking the **Token** generation link or visiting:
   ```
   https://trello.com/1/authorize?expiration=never&scope=read,write&response_type=token&key=YOUR_API_KEY
   ```
5. Authorize and copy the resulting token into `.env` as `TRELLO_TOKEN`.

---

### 3. ✉️ Connecting Gmail & Google Tasks

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (e.g. `Action Hub`).
3. Enable the **Gmail API** and **Google Tasks API** under **APIs & Services** -> **Library**.
4. Configure the **OAuth Consent Screen** (User Type: External, add your email as a Test User).
5. Create OAuth 2.0 Credentials:
   - Application type: **Web application**
   - Authorized redirect URI: `http://localhost:3000/oauth2callback`
   - Copy **Client ID** and **Client Secret** into `.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
6. Obtain your Refresh Token and set `GOOGLE_REFRESH_TOKEN` in `.env`.

---

## 📁 Project Architecture

```
src/
├── index.ts               # Main application bootstrap (Slack Socket Mode + Web server)
├── config.ts              # Central typed configuration & environment loader
├── types/
│   ├── task.ts            # Unified TaskItem, Filter, and AggregatedStats models
│   └── provider.ts        # TaskProvider interface specification
├── providers/
│   ├── trello/            # Trello REST API integration (Cards, Dues, Checklists)
│   ├── mail/              # Gmail (Starred / TODO) & Google Tasks integration
│   └── mock/              # Demo & sample data provider for out-of-the-box testing
├── services/
│   ├── taskAggregator.ts  # Core engine: merges, prioritizes, deduplicates & caches
│   └── scheduler.ts       # Cron scheduler for morning Slack briefings
├── slack/
│   ├── homeTab.ts         # Block Kit builder for the interactive App Home Tab
│   ├── messages.ts        # Morning digest & summary Block Kit builders
│   ├── commands.ts        # Slash command handlers (/actions, /tasks)
│   └── actions.ts         # Interactive button & filter handlers
└── web/
    └── server.ts          # Express API server for web dashboard & OAuth helpers
public/
└── index.html             # Responsive visual task matrix web interface
tests/
└── aggregator.test.ts     # Verification and integration test suite
```

---

## 🛠️ REST API Endpoints

- `GET /api/tasks` - Retrieve tasks (supports `?source=trello|gmail|google_tasks`, `?priority=urgent|high|medium`, `?q=search`, `?refresh=true`)
- `GET /api/stats` - Retrieve current aggregated task counts and metrics
- `POST /api/tasks/:id/complete` - Mark a task as completed
- `POST /api/tasks/:id/snooze` - Snooze a task for specified hours (default: 24h)
- `POST /api/refresh` - Force an immediate refresh from all connected providers
- `GET /oauth2callback` - Helper page to receive Google OAuth authorization codes

---

## 📜 License

MIT License © Fredrik Goth
