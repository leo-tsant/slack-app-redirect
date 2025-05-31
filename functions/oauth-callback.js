const { App } = require('@slack/bolt');

exports.handler = async function(event, context) {
  try {
    const { code } = event.queryStringParameters;
    
    const app = new App({
      clientId: process.env.SLACK_CLIENT_ID,
      clientSecret: process.env.SLACK_CLIENT_SECRET,
      signingSecret: process.env.SLACK_SIGNING_SECRET
    });

    const result = await app.client.oauth.v2.access({
      client_id: process.env.SLACK_CLIENT_ID,
      client_secret: process.env.SLACK_CLIENT_SECRET,
      code
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Successfully installed app! You can close this window.'
      })
    };
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Error installing app'
      })
    };
  }
}; 