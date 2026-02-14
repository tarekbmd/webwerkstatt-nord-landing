# Webwerkstatt Nord — Landing Page

Landing Page for `webwerkstatt-nord.de` (Root Domain).

## Setup

### GitHub Pages
- Repo: `tarekbmd/webwerkstatt-nord-landing`
- Branch: `main`
- CNAME: `webwerkstatt-nord.de`

### DNS Records
```
A     webwerkstatt-nord.de    185.199.108.153
A     webwerkstatt-nord.de    185.199.109.153
A     webwerkstatt-nord.de    185.199.110.153
A     webwerkstatt-nord.de    185.199.111.153
```
MX records for Google Workspace bleiben bestehen.

### Cloudflare Worker
```bash
cd worker/
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_CHAT_ID
wrangler secret put APPS_SCRIPT_URL
wrangler deploy
```

### Google Apps Script
See `worker/google-apps-script.js` — deploy as Web App in the lead spreadsheet.
