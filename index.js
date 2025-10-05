// index.js
require('dotenv').config();

const express = require('express');
const {
  ActivityHandler,
  CloudAdapter,
  ConfigurationServiceClientCredentialFactory,
  createBotFrameworkAuthenticationFromConfiguration
} = require('botbuilder');

// --------- Lecture des variables d'env (sans drama) ----------
const env = {
  MicrosoftAppId: process.env.MicrosoftAppId,
  MicrosoftAppPassword: process.env.MicrosoftAppPassword,
  MicrosoftAppType: process.env.MicrosoftAppType || 'MultiTenant',
  ChannelService: process.env.ChannelService, // ex: https://europe.api.botframework.com (regional)
  BotOpenIdMetadata: process.env.BotOpenIdMetadata // ex: https://europe.botframework.com/v1/.well-known/openidconfiguration
};

// Logs de diagnostic (aucun secret affiché)
console.log('=== BOOT DIAGNOSTICS ===');
console.log('AppId:', env.MicrosoftAppId || '(manquant)');
console.log('AppType:', env.MicrosoftAppType);
console.log('ChannelService:', env.ChannelService || '(non défini)');
console.log('BotOpenIdMetadata:', env.BotOpenIdMetadata || '(non défini)');
console.log('Secret length:', env.MicrosoftAppPassword ? String(env.MicrosoftAppPassword.length) : '0');
console.log('=========================');

// --------- Auth Bot Framework ----------
const creds = new ConfigurationServiceClientCredentialFactory({
  MicrosoftAppId: env.MicrosoftAppId,
  MicrosoftAppPassword: env.MicrosoftAppPassword,
  MicrosoftAppType: env.MicrosoftAppType
  // IMPORTANT: pas de MicrosoftAppTenantId en MultiTenant
});

const bfa = createBotFrameworkAuthenticationFromConfiguration(
  {
    // Pass-through explicite des endpoints régionaux si fournis
    ChannelService: env.ChannelService,
    BotOpenIdMetadata: env.BotOpenIdMetadata
  },
  creds
);

const adapter = new CloudAdapter(bfa);

// Gestion propre des erreurs pour voir les vraies causes
adapter.onTurnError = async (context, error) => {
  console.error('onTurnError:', error);
  await context.sendActivity('Une erreur est survenue côté serveur.');
};

// --------- Bot écho basique ----------
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

// Healthchecks et connectivité manuels
app.get('/', (_req, res) => {
  res.type('text/plain').send('OK: root reachable');
});
app.get('/healthz', (_req, res) => {
  res.json({
    status: 'ok',
    appId: env.MicrosoftAppId || null,
    appType: env.MicrosoftAppType,
    channelService: env.ChannelService || null,
    openId: env.BotOpenIdMetadata || null,
    secretLen: env.MicrosoftAppPassword ? env.MicrosoftAppPassword.length : 0
  });
});
app.get('/ping', (_req, res) => res.type('text/plain').send('pong'));

// Endpoint Bot Framework (doit être POST)
app.post('/api/messages', (req, res) => {
  adapter.process(req, res, (context) => bot.run(context));
});

// Pour les curieux qui ouvrent /api/messages en GET dans un navigateur
app.get('/api/messages', (_req, res) => {
  res.status(405).type('text/plain').send('Use POST /api/messages');
});

const port = process.env.PORT || 3978;
app.listen(port, () => {
  console.log(`✅ Bot up on http://localhost:${port}/api/messages`);
});
