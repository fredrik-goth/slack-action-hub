import http from 'http';
import url from 'url';
import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3000/oauth2callback';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/calendar.readonly',
];

async function main() {
  console.log('====================================================');
  console.log('🔐 Google Workspace OAuth Setup (Gmail, Calendar, Tasks)');
  console.log('====================================================\n');

  if (!CLIENT_ID || !CLIENT_SECRET || CLIENT_ID.includes('your-') || CLIENT_SECRET.includes('your-')) {
    console.error('❌ Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in .env');
    console.log('\nTo get these:');
    console.log('1. Go to https://console.cloud.google.com/');
    console.log('2. Create a project and enable: Gmail API, Google Calendar API, Google Tasks API');
    console.log('3. Under Credentials -> Create Credentials -> OAuth Client ID (Web Application)');
    console.log(`4. Add Authorized Redirect URI: ${REDIRECT_URI}`);
    console.log('5. Paste GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET into .env and re-run this script.\n');
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });

  console.log('👉 Please open this URL in your browser to authorize your Google Account:');
  console.log('\n------------------------------------------------------------');
  console.log(authUrl);
  console.log('------------------------------------------------------------\n');
  console.log('⏳ Waiting for authorization callback on http://localhost:3000/oauth2callback ...');

  const server = http.createServer(async (req, res) => {
    try {
      if (req.url && req.url.startsWith('/oauth2callback')) {
        const queryParams = new url.URL(req.url, 'http://localhost:3000').searchParams;
        const code = queryParams.get('code');

        if (code) {
          const { tokens } = await oauth2Client.getToken(code);
          console.log('\n🎉 Successfully obtained Google OAuth tokens!');

          if (tokens.refresh_token) {
            // Update .env file
            const envPath = path.join(process.cwd(), '.env');
            let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

            if (envContent.includes('GOOGLE_REFRESH_TOKEN=')) {
              envContent = envContent.replace(/GOOGLE_REFRESH_TOKEN=.*/, `GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
            } else {
              envContent += `\nGOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`;
            }

            fs.writeFileSync(envPath, envContent, 'utf8');
            console.log('✓ [Config] Saved GOOGLE_REFRESH_TOKEN to .env file!');
          }

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: system-ui, sans-serif; padding: 40px; text-align: center; background: #0f172a; color: #f8fafc;">
                <h2>🎉 Google Account Connected Successfully!</h2>
                <p>Your Gmail, Google Calendar, and Google Tasks are now linked to Action Hub.</p>
                <p>You can close this tab and return to Slack.</p>
              </body>
            </html>
          `);

          server.close(() => {
            console.log('✓ [Setup Complete] You can now restart Action Hub with: npm run dev\n');
            process.exit(0);
          });
        }
      }
    } catch (err) {
      console.error('Error during token exchange:', err);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Authentication failed. Check terminal logs.');
    }
  });

  server.listen(3000);
}

main().catch(console.error);
