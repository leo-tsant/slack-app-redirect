# Slack App with OAuth Authentication

This is a Slack app that handles OAuth authentication and can be deployed to Netlify.

## Setup Instructions

1. Create a new Slack app at https://api.slack.com/apps
2. Configure your app's OAuth settings:
   - Add the following scopes:
     - `chat:write`
     - `channels:read`
     - `groups:read`
     - `im:read`
     - `mpim:read`
   - Set the Redirect URL to: `https://your-netlify-app.netlify.app/slack/oauth/callback`

3. Install dependencies:
```bash
npm install
```

4. Create a `.env` file based on `.env.example` and fill in your Slack app credentials:
- `SLACK_BOT_TOKEN`: Your bot token (starts with `xoxb-`)
- `SLACK_SIGNING_SECRET`: Your app's signing secret
- `SLACK_CLIENT_ID`: Your app's client ID
- `SLACK_CLIENT_SECRET`: Your app's client secret
- `STATE_SECRET`: A random string for state verification

## Local Development

Run the development server:
```bash
npm run dev
```

## Deployment to Netlify

1. Create a new site on Netlify:
```bash
netlify init
```

2. Set up environment variables in Netlify:
   - Go to Site settings > Build & deploy > Environment
   - Add all the environment variables from your `.env` file

3. Deploy your site:
```bash
netlify deploy --prod
```

4. After deployment, update your Slack app's OAuth Redirect URL to your Netlify URL:
   - Go to your Slack app settings
   - Update the Redirect URL to: `https://your-netlify-app.netlify.app/slack/oauth/callback`

## Testing the App

1. Visit your Netlify URL
2. Click the "Add to Slack" button
3. Authorize the app
4. You should see a success message

## Security Notes

- Never commit your `.env` file
- Store tokens securely in production
- Use environment variables for all sensitive information