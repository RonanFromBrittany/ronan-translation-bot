// index.js
require('dotenv').config();

const express = require('express');
const {
  ActivityHandler,
  CloudAdapter,
  ConfigurationServiceClientCredentialFactory,
  createBotFrameworkAuthenticationFromConfiguration
} = require('botbuilder');

// --------- Configuration lisible par le SDK (Map avec .get) ----------
const settings = new Map(Object.entries({
  MicrosoftAppType: process.env.MicrosoftAppType || 'MultiTenant',
  MicrosoftAppId: process.env.MicrosoftAppId,
  MicrosoftAppPassword: process.env.MicrosoftAppPassword,

  // Europe (régional)
  ChannelService: 'https://europe.api.botframework.com',
  BotOpenIdMetadata: 'https://europe.botframework.com/v1/.well-known/openidconfiguration',

  // ⚠️ Fige la portée GLOBALE (DirectLine, WebChat, Teams, etc.)
  ToChannelFromBotLoginUrl: 'https://login.microsoftonline.com/botframework.com',
  ToChannelFromBotOAuthScope: 'https://api.botframework.com/.default'
}));

// --------- Diagnostics au démarrage ----------
console.log('=== BOOT DIAGNOSTICS ===');
console.log('AppId:', settings.get('MicrosoftAppId') || '(manquant)');
console.log('AppType:', settings.get('MicrosoftAppType'));
console.log('ChannelService:', settings.get('ChannelService'));
console.log('OpenId:', settings.get('BotOpenIdMetadata'));
const pw = settings.get('MicrosoftAppPassword');
console.log('Secret length:', pw ? String(pw.length) : '0');
console.log('=========================');

// --------- Auth Bot Framework ----------
const credentialsFactory = new ConfigurationServiceClientCredentialFactory({
  MicrosoftAppId: settings.get('MicrosoftAppId'),
  MicrosoftAppPassword: settings.get('MicrosoftAppPassword'),
  MicrosoftAppType: settings.get('MicrosoftAppType')
  // ⚠️ ne pas ajouter MicrosoftAppTenantId en MultiTenant
});

const botFrameworkAuth = createBotFrameworkAuthenticationFromConfiguration(
  settings,
  credentialsFactory
);

const adapter = new CloudAdapter(botFrameworkAuth);

// --------- Gestion d’erreur ----------
adapter.onTurnError = async (context, error) => {
  console.error('onTurnError:', error);
  await context.sendActivity('❌ Une erreur est survenue côté serveur.');
};

// --------- Bot écho minimal ----------
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

// --------- Serveur Express ----------
const app = express();
app.use(express.json());

// Healthchecks utiles
app.get('/', (_req, res) => res.type('text/plain').send('✅ Root reachable'));
app.get('/ping', (_req, res) => res.type('text/plain').send('pong'));
app.get('/healthz', (_req, res) => {
  res.json({
    status: 'ok',
    appId: settings.get('MicrosoftAppId') || null,
    appType: settings.get('MicrosoftAppType'),
    channelService: settings.get('ChannelService'),
    openId: settings.get('BotOpenIdMetadata'),
    secretLen: pw ? pw.length : 0
  });
});

// --------- Diagnostic OAuth: vérifie le jeton Azure AD ---------
app.get('/diag/oauth', async (_req, res) => {
  try {
    const { ConfidentialClientApplication } = require('@azure/msal-node');
    const msal = new ConfidentialClientApplication({
      auth: {
        clientId: settings.get('MicrosoftAppId'),
        clientSecret: settings.get('MicrosoftAppPassword'),
        authority: settings.get('ToChannelFromBotLoginUrl')
      }
    });
    const scope = settings.get('ToChannelFromBotOAuthScope');
    const result = await msal.acquireTokenByClientCredential({ scopes: [scope] });

    if (!result?.accessToken) {
      return res.status(500).json({ ok: false, error: 'no_token', detail: result });
    }

    res.json({
      ok: true,
      scope,
      expiresOn: result.expiresOn?.toISOString?.() || null,
      tokenStartsWith: result.accessToken.slice(0, 16)
    });
  } catch (err) {
    res.status(401).json({ ok: false, error: 'oauth_failed', message: String(err?.message || err) });
  }
});

// --------- Log toutes les activités reçues ----------
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

// --------- Endpoint principal Bot Framework ----------
app.post('/api/messages', (req, res) => {
  adapter.process(req, res, (context) => bot.run(context));
});

// Empêcher GET /api/messages
app.get('/api/messages', (_req, res) => {
  res.status(405).type('text/plain').send('Use POST /api/messages');
});

// --------- Démarrage serveur ----------
const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`🚀 Bot up on http://localhost:${port}/api/messages`);
});
