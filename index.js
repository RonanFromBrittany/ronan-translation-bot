// index.js
require('dotenv').config();

const express = require('express');
const {
  ActivityHandler,
  CloudAdapter,
  ConfigurationServiceClientCredentialFactory,
  createBotFrameworkAuthenticationFromConfiguration
} = require('botbuilder');

// --------- Configuration lisible par le SDK (avec .get) ----------
const settings = new Map(Object.entries({
  MicrosoftAppType: process.env.MicrosoftAppType || 'MultiTenant',
  MicrosoftAppId: process.env.MicrosoftAppId,
  MicrosoftAppPassword: process.env.MicrosoftAppPassword,
  // Europe (régional) — garde vides si tu es en Global
  ChannelService: process.env.ChannelService || 'https://europe.api.botframework.com',
  BotOpenIdMetadata: process.env.BotOpenIdMetadata || 'https://europe.botframework.com/v1/.well-known/openidconfiguration',
  ToChannelFromBotLoginUrl: process.env.ToChannelFromBotLoginUrl || 'https://login.microsoftonline.com/botframework.com',
  ToChannelFromBotOAuthScope: process.env.ToChannelFromBotOAuthScope || 'https://europe.api.botframework.com/.default'
}));

// Diagnostics sans balancer le secret
console.log('=== BOOT DIAGNOSTICS ===');
console.log('AppId:', settings.get('MicrosoftAppId') || '(manquant)');
console.log('AppType:', settings.get('MicrosoftAppType'));
console.log('ChannelService:', settings.get('ChannelService') || '(non défini)');
console.log('OpenId:', settings.get('BotOpenIdMetadata') || '(non défini)');
const pw = settings.get('MicrosoftAppPassword');
console.log('Secret length:', pw ? String(pw.length) : '0');
console.log('=========================');

// --------- Auth Bot Framework ----------
const credentialsFactory = new ConfigurationServiceClientCredentialFactory({
  MicrosoftAppId: settings.get('MicrosoftAppId'),
  MicrosoftAppPassword: settings.get('MicrosoftAppPassword'),
  MicrosoftAppType: settings.get('MicrosoftAppType')
  // Surtout pas de MicrosoftAppTenantId en MultiTenant
});

const botFrameworkAuth = createBotFrameworkAuthenticationFromConfiguration(
  settings, // <- plus "null", un vrai config avec .get
  credentialsFactory
);

const adapter = new CloudAdapter(botFrameworkAuth);

// Gestion d’erreur lisible
adapter.onTurnError = async (context, error) => {
  console.error('onTurnError:', error);
  await context.sendActivity('Une erreur est survenue côté serveur.');
};

// --------- Bot écho minimal ----------
class EchoBot extends ActivityHandler {
  constructor() {
    super();
    this.onMembersAdded(async (ctx) => {
      await ctx.sendActivity('Bot prêt. Dis "hello".');
    });
    this.onMessage(async (ctx) => {
      await ctx.sendActivity(`Tu as dit: "${ctx.activity.text}"`);
    });
  }
}
const bot = new EchoBot();

// --------- Serveur HTTP ----------
const app = express();
app.use(express.json());

// Healthchecks
app.get('/', (_req, res) => res.type('text/plain').send('OK: root reachable'));
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

// Log TOUTES les activités reçues (sans secrets)
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

// Endpoint Bot Framework
app.post('/api/messages', (req, res) => {
  adapter.process(req, res, (context) => bot.run(context));
});

// Pour les curieux qui testent au navigateur
app.get('/api/messages', (_req, res) => {
  res.status(405).type('text/plain').send('Use POST /api/messages');
});

const port = process.env.PORT || 3978;
app.listen(port, () => {
  console.log(`✅ Bot up on http://localhost:${port}/api/messages`);
});
