/**
 * Landing Form Worker — webwerkstatt-nord.de
 *
 * POST /api/lead → Validates → Google Sheet (via Apps Script) → Telegram notification
 *
 * Environment Variables (Secrets):
 *   TELEGRAM_BOT_TOKEN  - Telegram bot token
 *   TELEGRAM_CHAT_ID    - Chat ID for notifications
 *   APPS_SCRIPT_URL     - Google Apps Script Web App URL for Sheet writes
 *
 * KV Namespace:
 *   RATE_LIMIT - For rate limiting (5 submissions/IP/hour)
 */

const ALLOWED_ORIGINS = [
  'https://webwerkstatt-nord.de',
  'https://www.webwerkstatt-nord.de',
];

// Allow localhost in development
const DEV_ORIGINS = [
  'http://localhost:8080',
  'http://127.0.0.1:8080',
  'http://localhost:3000',
];

function getCorsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = [...ALLOWED_ORIGINS, ...(env.ENVIRONMENT === 'dev' ? DEV_ORIGINS : [])];

  if (allowed.includes(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    };
  }
  return {};
}

function jsonResponse(data, status, corsHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}

// Rate limiting: max 5 per IP per hour
async function checkRateLimit(ip, env) {
  if (!env.RATE_LIMIT) return true;

  const key = `rl:${ip}`;
  const data = await env.RATE_LIMIT.get(key);

  if (!data) {
    await env.RATE_LIMIT.put(key, '1', { expirationTtl: 3600 });
    return true;
  }

  const count = parseInt(data, 10);
  if (count >= 5) return false;

  await env.RATE_LIMIT.put(key, String(count + 1), { expirationTtl: 3600 });
  return true;
}

// Validate input
function validateLead(data) {
  const errors = [];

  if (!data.firma || typeof data.firma !== 'string' || data.firma.trim().length < 2) {
    errors.push('Firmenname ist erforderlich (min. 2 Zeichen)');
  }
  if (data.firma && data.firma.length > 200) {
    errors.push('Firmenname zu lang');
  }

  if (!data.email || typeof data.email !== 'string') {
    errors.push('E-Mail ist erforderlich');
  } else {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email.trim())) {
      errors.push('Ungültige E-Mail-Adresse');
    }
  }

  if (data.telefon && typeof data.telefon === 'string' && data.telefon.length > 30) {
    errors.push('Telefonnummer zu lang');
  }

  // Honeypot
  if (data.website) {
    errors.push('Bot detected');
  }

  return errors;
}

// Send Telegram notification
async function sendTelegram(env, lead) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;

  const text = [
    '🔔 *Neuer Inbound Lead!*',
    '',
    `🏢 *Firma:* ${escapeMarkdown(lead.firma)}`,
    `📧 *E-Mail:* ${escapeMarkdown(lead.email)}`,
    lead.telefon ? `📞 *Telefon:* ${escapeMarkdown(lead.telefon)}` : '',
    `📍 *Quelle:* ${escapeMarkdown(lead.quelle || 'landing-page')}`,
    '',
    `⏰ ${new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}`,
  ].filter(Boolean).join('\n');

  try {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'Markdown',
      }),
    });
  } catch (e) {
    console.error('Telegram error:', e);
  }
}

function escapeMarkdown(text) {
  return String(text).replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

// Write to Google Sheet via Apps Script Web App
async function writeToSheet(env, lead) {
  if (!env.APPS_SCRIPT_URL) return;

  try {
    const res = await fetch(env.APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        firma: lead.firma,
        email: lead.email,
        telefon: lead.telefon || '',
        quelle: lead.quelle || 'landing-page',
      }),
    });

    if (!res.ok) {
      console.error('Sheet write failed:', res.status);
    }
  } catch (e) {
    console.error('Sheet error:', e);
  }
}

export default {
  async fetch(request, env) {
    const corsHeaders = getCorsHeaders(request, env);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Health check
    if (new URL(request.url).pathname === '/health') {
      return jsonResponse({ status: 'ok', timestamp: Date.now() }, 200, corsHeaders);
    }

    // Only POST /api/lead
    const url = new URL(request.url);
    if (url.pathname !== '/api/lead' || request.method !== 'POST') {
      return jsonResponse({ error: 'Not found' }, 404, corsHeaders);
    }

    // Rate limit
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const allowed = await checkRateLimit(ip, env);
    if (!allowed) {
      return jsonResponse({ error: 'Zu viele Anfragen. Bitte versuchen Sie es später.' }, 429, corsHeaders);
    }

    // Parse body
    let data;
    try {
      data = await request.json();
    } catch {
      return jsonResponse({ error: 'Ungültige Anfrage' }, 400, corsHeaders);
    }

    // Validate
    const errors = validateLead(data);
    if (errors.length > 0) {
      return jsonResponse({ error: errors[0] }, 400, corsHeaders);
    }

    const lead = {
      firma: data.firma.trim(),
      email: data.email.trim().toLowerCase(),
      telefon: data.telefon ? data.telefon.trim() : '',
      quelle: data.quelle || 'landing-page',
    };

    // Write to Sheet + send Telegram in parallel
    await Promise.allSettled([
      writeToSheet(env, lead),
      sendTelegram(env, lead),
    ]);

    return jsonResponse({ success: true, message: 'Anfrage erhalten' }, 200, corsHeaders);
  },
};
