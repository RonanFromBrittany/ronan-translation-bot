require('dotenv').config();
const axios = require('axios');

async function getToken() {
  const tenant = 'botframework.com';
  const url = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;

  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', process.env.MicrosoftAppId);
  params.append('client_secret', process.env.MicrosoftAppPassword);
  params.append('scope', 'https://api.botframework.com/.default');

  try {
    const response = await axios.post(url, params);
    const token = response.data.access_token;
    console.log('✅ Access Token récupéré.');
    return token;
  } catch (error) {
    console.error('❌ Erreur de récupération du token :');
    console.error(error.response ? error.response.data : error.message);
    process.exit(1);
  }
}

async function testBot() {
  const token = await getToken();

  const botEndpoint = process.env.BotEndpoint || 'https://ronan-translation-web-app-dmfne6gmeydvf4dn.swedencentral-01.azurewebsites.net/api/messages';
  const payload = {
    type: 'message',
    from: { id: 'user1', name: 'Ronan' },
    text: 'hello',
    locale: 'fr-FR'
  };

  try {
    console.log(`🛰️ Envoi d’un message de test vers ${botEndpoint} ...`);
    const response = await axios.post(botEndpoint, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Réponse du bot :');
    console.log(response.data);
  } catch (error) {
    console.error('❌ Erreur lors de la requête vers le bot :');
    console.error(error.response ? error.response.data : error.message);
  }
}

testBot();
