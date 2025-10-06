require('dotenv').config();
const axios = require('axios');

const DL_BASE = (process.env.DIRECT_LINE_BASE || 'https://directline.botframework.com').replace(/\/+$/, '');
const DL_API = `${DL_BASE}/v3/directline`;

async function generateDirectLineToken() {
  const secret = process.env.DIRECT_LINE_SECRET;
  if (!secret) throw new Error('DIRECT_LINE_SECRET missing in .env');

  const res = await axios.post(
    `${DL_API}/tokens/generate`,
    { User: { Id: 'user1' } },
    { headers: { Authorization: `Bearer ${secret}` } }
  );
  return res.data.token;
}

async function startConversation(token) {
  const res = await axios.post(
    `${DL_API}/conversations`,
    {},
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data.conversationId;
}

async function sendMessage(token, conversationId, text) {
  const activity = {
    type: 'message',
    from: { id: 'user1', name: 'Ronan' },
    text,
    locale: 'fr-FR'
  };

  const res = await axios.post(
    `${DL_API}/conversations/${conversationId}/activities`,
    activity,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  );
  return res.data;
}

(async () => {
  try {
    console.log('DL base:', DL_BASE);
    const token = await generateDirectLineToken();
    console.log('✅ Direct Line token OK');

    const conversationId = await startConversation(token);
    console.log('💬 conversationId:', conversationId);

    const sendRes = await sendMessage(token, conversationId, 'hello');
    console.log('➡️ sent activity id:', sendRes.id || '(none)');

    // optional: read activities
    const poll = await axios.get(
      `${DL_API}/conversations/${conversationId}/activities`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const botMsgs = poll.data.activities?.filter(a => a.type === 'message' && a.from?.role === 'bot') || [];
    for (const m of botMsgs) console.log('🤖', m.text);
  } catch (err) {
    if (err.response) {
      console.error('HTTP', err.response.status, err.response.data);
    } else {
      console.error(err);
    }
  }
})();
