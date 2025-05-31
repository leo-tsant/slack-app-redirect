# Slack OAuth App for Netlify

This is a complete Slack OAuth implementation that can be deployed on Netlify. It handles the OAuth flow securely using Netlify Functions.

## File Structure

```
.
├── index.html                    # Landing page with "Add to Slack" button
├── callback.html                 # OAuth callback handler page
├── netlify/
│   └── functions/
│       └── slack-oauth.js       # Serverless function for token exchange
├── package.json                 # Node.js dependencies
├── netlify.toml                 # Netlify configuration
└── README.md                    # This file
```

## Setup Instructions

### 1. Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click "Create New App" → "From scratch"
3. Give your app a name and select a workspace
4. Note your **Client ID** and **Client Secret** from the "Basic Information" page

### 2. Configure OAuth & Permissions

1. Go to "OAuth & Permissions" in your app settings
2. Add a Redirect URL: `https://YOUR-SITE-NAME.netlify.app/callback`
3. Add the scopes your app needs under "Bot Token Scopes" (e.g., `chat:write`, `channels:read`)

### 3. Update the Code

In `index.html`, replace:
- `YOUR_CLIENT_ID` with your Slack app's Client ID
- `YOUR_REDIRECT_URI` with `https://YOUR-SITE-NAME.netlify.app/callback`
- Update the `scope` parameter with your required scopes

### 4. Deploy to Netlify

1. Create a new repository on GitHub and push all files
2. Connect your GitHub repo to Netlify
3. Add environment variables in Netlify dashboard:
   - `SLACK_CLIENT_ID` - Your Slack app's Client ID
   - `SLACK_CLIENT_SECRET` - Your Slack app's Client Secret
   - `SLACK_REDIRECT_URI` - Your callback URL (optional, defaults to `YOUR_NETLIFY_URL/callback`)

### 5. Test Your App

1. Visit your Netlify site
2. Click the "Add to Slack" button
3. Authorize the app in your workspace
4. You should see a success message with installation details

## Important Security Notes

- **Never expose your Client Secret** in frontend code
- The Netlify Function handles the token exchange securely
- Store access tokens securely (this example doesn't include persistent storage)
- In production, implement proper token storage (database, secure key-value store, etc.)

## Customization

### Scopes
Update the scopes in the OAuth URL in `index.html` based on your needs:
- `chat:write` - Send messages
- `channels:read` - View channel information
- `channels:history` - Read channel messages
- `users:read` - View user information
- See [full list of scopes](https://api.slack.com/scopes)

### Styling
Both HTML files include basic styling that you can customize to match your brand.

### Token Storage
The current implementation doesn't store tokens. In production, you should:
1. Store tokens in a secure database
2. Associate tokens with team IDs
3. Implement token refresh if using rotation
4. Add encryption for sensitive data

## Troubleshooting

### "Invalid client_id" error
- Double-check your Client ID in both the HTML and environment variables
- Ensure there are no extra spaces or characters

### "Bad redirect_uri" error
- Make sure the redirect URI in your code exactly matches what's configured in Slack
- Include the full URL with https://

### "Invalid_scope" error
- Check that all requested scopes are valid
- Ensure scopes are comma-separated with no spaces

### Function timeout
- Netlify Functions have a 10-second timeout by default
- If needed, upgrade to Netlify Functions Pro for longer timeouts

## Next Steps

After successful OAuth:
1. Store the access token securely
2. Use the token to make Slack API calls
3. Set up event subscriptions or slash commands
4. Implement proper error handling and logging

## Resources

- [Slack OAuth Documentation](https://api.slack.com/authentication/oauth-v2)
- [Netlify Functions Documentation](https://docs.netlify.com/functions/overview/)
- [Slack Web API](https://api.slack.com/web)