const { App } = require('@slack/bolt');
const express = require('express');
require('dotenv').config();

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  clientId: process.env.SLACK_CLIENT_ID,
  clientSecret: process.env.SLACK_CLIENT_SECRET,
  stateSecret: process.env.STATE_SECRET,
  scopes: [
    'chat:write',
    'channels:read',
    'groups:read',
    'im:read',
    'mpim:read',
    'app_mentions:read',
    'commands'
  ]
});

// Initialize Express app
const expressApp = express();

// Add a simple message handler
app.message('hello', async ({ message, say }) => {
  await say(`Hey there <@${message.user}>!`);
});

// OAuth callback handler
expressApp.get('/slack/oauth/callback', async (req, res) => {
  try {
    const { code } = req.query;
    const result = await app.client.oauth.v2.access({
      client_id: process.env.SLACK_CLIENT_ID,
      client_secret: process.env.SLACK_CLIENT_SECRET,
      code
    });

    // Store the tokens securely (in a real app, you'd want to store these in a database)
    console.log('Successfully installed app!');
    
    res.send('Successfully installed app! You can close this window.');
  } catch (error) {
    console.error(error);
    res.status(500).send('Error installing app');
  }
});

// Start the app
(async () => {
  await app.start();
  expressApp.listen(process.env.PORT || 3000);
  console.log('⚡️ Bolt app is running!');
})(); 