// index.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { ConfidentialClientApplication } = require('@azure/msal-node');
const {
  ActivityHandler,
  CloudAdapter,
  ConfigurationServiceClientCredentialFactory,
  createBotFrameworkAuthenticationFromConfiguration
} = require('botbuilder');

// -------- Configuration lisible par le SDK ----------
const settings = new Map(Object.entries({
  MicrosoftAppType: process.env.MicrosoftAppType || 'MultiTenant',
  MicrosoftAppId: process.env.MicrosoftAppId,
  MicrosoftAppPassword: process.env.MicrosoftAppPassword,

  // Europe (régional)
  ChannelService: process.env.ChannelService || 'https://europe.api.botframework.com',
  BotOpenIdMetadata: process.env.BotOpenIdMetadata || 'https://europe.botframework.com/v1/.well-known/openidconfiguration',

  // Portée globale pour Direct Line / Web Chat
  ToChannelFromBotLoginUrl: process.env.ToChannelFromBotLoginUrl || 'https://login.microsoftonline.com/botframework.com',
  ToChannelFromBotOAuthScope: process.env.ToChannelFromBotOAuthScope || 'https://api.botframework.com/.default'
}));

// -------- Diagnostics initiaux ----------
console.log('=== BOOT DIAGNOSTICS ===');
console.log('AppId:', settings.get('MicrosoftAppId') || '(manquant)');
console.log('AppType:', settings.get('MicrosoftAppType'));
console.log('ChannelService:', settings.get('ChannelService') || '(non défini)');
console.log('OpenId:', settings.get('BotOpenIdMetadata') || '(non défini)');
const pw = settings.get('MicrosoftAppPassword');
console.log('Secret length:', pw ? String(pw.length) : '0');
console.log('=========================');

// -------- Auth Bot Framework ----------
const credentialsFactory = new ConfigurationServiceClientCredentialFactory({
  MicrosoftAppId: settings.get('MicrosoftAppId'),
  MicrosoftAppPassword: settings.get('MicrosoftAppPassword'),
  MicrosoftAppType: settings.get('MicrosoftAppType')
});

const botFrameworkAuth = createBotFrameworkAuthenticationFromConfiguration(settings, credentialsFactory);
const adapter = new CloudAdapter(botFrameworkAuth);

// -------- Gestion d’erreurs globales ----------
adapter.onTurnError = async (context, error) => {
  console.error('onTurnError:', error);
  await context.sendActivity('❌ Une erreur est survenue côté serveur.');
};

// -------- Bot Écho minimal ----------
class EchoBot extends ActivityHandler {
  constructor() {
    super();
    this.onMembersAdded(async (ctx) => {
      await ctx.sendActivity('👋 Bot prêt. Dis "hello".');
    });
    this.onMessage(async (ctx) => {
      await ctx.sendActivity(`🪞 Tu as dit: "${ctx.activity.text}"`);
    });
  }
}
const bot = new EchoBot();

// -------- Serveur Express ----------
const app = express();
app.use(express.json());

// ---- Healthchecks ----
app.get('/', (_req, res) => res.type('text/plain').send('✅ Root reachable'));
app.get('/ping', (_req, res) => res.type('text/plain').send('pong'));
app.get('/healthz', (_req, res) => {
  res.json({
    status: 'ok',
    appId: settings.get('MicrosoftAppId') || null,
    appType: settings.get('MicrosoftAppType'),
    channelService: settings.get('ChannelService') || null,
    openId: settings.get('BotOpenIdMetadata') || null,
    secretLen: pw ? pw.length : 0
  });
});

// ---- DIAG 1 : Test OAuth direct ----
app.get('/diag/oauth', async (_req, res) => {
  try {
    const msal = new ConfidentialClientApplication({
      auth: {
        clientId: settings.get('MicrosoftAppId'),
        clientSecret: settings.get('MicrosoftAppPassword'),
        authority: settings.get('ToChannelFromBotLoginUrl')
      }
    });
    const scope = settings.get('ToChannelFromBotOAuthScope') || 'https://api.botframework.com/.default';
    const result = await msal.acquireTokenByClientCredential({ scopes: [scope] });
    if (!result?.accessToken) return res.status(500).json({ ok: false, error: 'no_token' });

    const [, payloadB64] = result.accessToken.split('.');
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString('utf8'));

    res.json({
      ok: true,
      scopeUsed: scope,
      tokenPreview: result.accessToken.slice(0, 40) + '…',
      expiresOn: result.expiresOn?.toISOString?.() || null,
      jwtPayload: {
        aud: payload.aud,
        iss: payload.iss,
        appid: payload.appid,
        exp: payload.exp
      }
    });
  } catch (err) {
    res.status(401).json({ ok: false, error: String(err) });
  }
});

// ---- DIAG 2 : Ping Direct Line avec token ----
app.post('/diag/ping-directline', async (req, res) => {
  const convId = String(req.query.convId || '').trim();
  if (!convId) return res.status(400).json({ ok: false, error: 'Missing ?convId=' });

  try {
    const msal = new ConfidentialClientApplication({
      auth: {
        clientId: settings.get('MicrosoftAppId'),
        clientSecret: settings.get('MicrosoftAppPassword'),
        authority: settings.get('ToChannelFromBotLoginUrl')
      }
    });
    const scope = settings.get('ToChannelFromBotOAuthScope') || 'https://api.botframework.com/.default';
    const { accessToken } = await msal.acquireTokenByClientCredential({ scopes: [scope] });

    const dlBase = 'https://europe.directline.botframework.com';
    const url = `${dlBase}/v3/conversations/${encodeURIComponent(convId)}/activities`;

    const body = {
      type: 'message',
      from: { id: settings.get('MicrosoftAppId') },
      text: '[diag] ping depuis le bot (OAuth)'
    };

    const r = await axios.post(url, body, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      validateStatus: () => true
    });

    res.json({ ok: r.status >= 200 && r.status < 300, status: r.status, data: r.data });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// ---- Log toutes les activités ----
adapter.use({
  onTurn: async (context, next) => {
    try {
      console.log('---- ACTIVITY IN ----');
      console.log('type:', context.activity?.type);
      console.log('channelId:', context.activity?.channelId);
      console.log('serviceUrl:', context.activity?.serviceUrl);
      console.log('from:', context.activity?.from?.id, context.activity?.from?.role);
      console.log('recipient:', context.activity?.recipient?.id, context.activity?.recipient?.role);
      console.log('text:', context.activity?.text);
      console.log('raw activity:', JSON.stringify(context.activity));
    } catch (e) {
      console.error('log activity failed:', e);
    }
    await next();
  }
});

// ---- Endpoint principal ----
app.post('/api/messages', (req, res) => {
  adapter.process(req, res, (context) => bot.run(context));
});
app.get('/api/messages', (_req, res) => {
  res.status(405).type('text/plain').send('Use POST /api/messages');
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`🚀 Bot up on http://localhost:${port}/api/messages`));
