require('dotenv').config(); // si tu utilises CommonJS (cas actuel)


const express = require('express');
const { ActivityHandler, CloudAdapter,
  ConfigurationServiceClientCredentialFactory,
  createBotFrameworkAuthenticationFromConfiguration } = require('botbuilder');

const creds = new ConfigurationServiceClientCredentialFactory({
  MicrosoftAppId: process.env.MicrosoftAppId,
  MicrosoftAppPassword: process.env.MicrosoftAppPassword,
  MicrosoftAppType: 'MultiTenant',
  MicrosoftAppTenantId: process.env.MicrosoftAppTenantId
});
const bfa = createBotFrameworkAuthenticationFromConfiguration(null, creds);
const adapter = new CloudAdapter(bfa);

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

const app = express();
app.use(express.json());

app.post('/api/messages', (req, res) => {
  adapter.process(req, res, (context) => bot.run(context));
});

const port = process.env.PORT || 3978;
app.listen(port, () => console.log(`Bot up on http://localhost:${port}/api/messages`));
