require('dotenv').config();
const axios = require('axios');

async function getToken() {
  const tenant = 'botframework.com'; // important : ne pas mettre ton tenant ID ici
  const url = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;

  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', process.env.MicrosoftAppId);
  params.append('client_secret', process.env.MicrosoftAppPassword);
  params.append('scope', 'https://api.botframework.com/.default');

  try {
    const response = await axios.post(url, params);
    console.log('✅ Access Token:\n');
    console.log(response.data.access_token);
  } catch (error) {
    console.error('❌ Erreur de récupération du token:');
    console.error(error.response ? error.response.data : error.message);
  }
}

getToken();
