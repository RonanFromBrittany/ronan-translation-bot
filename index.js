require('dotenv').config(); // charge .env si présent

const express = require('express');
const {
  ActivityHandler,
  CloudAdapter,
  ConfigurationServiceClientCredentialFactory,
  createBotFrameworkAuthenticationFromConfiguration
} = require('botbuilder');

// --- AUTHENTIFICATION ---
const creds = new ConfigurationServiceClientCredentialFactory({
  MicrosoftAppId: process.env.MicrosoftAppId,
  MicrosoftAppPassword: process.env.MicrosoftAppPassword,
  MicrosoftAppType: 'MultiTenant' // Multi-tenant = pas de TenantId ici
});

const bfa = createBotFrameworkAuthenticationFromConfiguration(null, creds);
const adapter = new CloudAdapter(bfa);

// gestion d’erreur propre
adapter.onTurnError = async (context, error) => {
  console.error('onTurnError:', error);
  await context.sendActivity('Oups, une erreur est survenue.');
};

// vérification de présence des variables d’environnement
if (!process.env.MicrosoftAppId || !process.env.MicrosoftAppPassword) {
  console.warn('⚠️  Variables manquantes: MicrosoftAppId ou MicrosoftAppPassword');
}

// --- BOT ---
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

// --- SERVEUR EXPRESS ---
const app = express();
app.use(express.json());

app.post('/api/messages', (req, res) => {
  adapter.process(req, res, (context) => bot.run(context));
});

const port = process.env.PORT || 3978;
app.listen(port, () => console.log(`✅ Bot up on http://localhost:${port}/api/messages`));
