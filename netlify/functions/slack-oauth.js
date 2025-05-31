// netlify/functions/slack-oauth.js
const https = require('https');
const querystring = require('querystring');

exports.handler = async (event, context) => {
    console.log('Function called with method:', event.httpMethod);
    
    if (event.httpMethod !== 'POST') {
        console.log('Invalid method:', event.httpMethod);
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    let body;
    try {
        body = JSON.parse(event.body);
        console.log('Received body:', JSON.stringify(body, null, 2));
    } catch (error) {
        console.error('Failed to parse body:', error);
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Invalid request body' })
        };
    }

    const { code, state } = body;

    if (!code) {
        console.log('Missing authorization code');
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Missing authorization code' })
        };
    }

    const clientId = process.env.SLACK_CLIENT_ID;
    const clientSecret = process.env.SLACK_CLIENT_SECRET;
    const redirectUri = process.env.SLACK_REDIRECT_URI || `${process.env.URL}/callback`;

    console.log('Using redirect URI:', redirectUri);

    if (!clientId || !clientSecret) {
        console.error('Missing Slack credentials in environment variables');
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Server configuration error' })
        };
    }

    const postData = querystring.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        redirect_uri: redirectUri
    });

    console.log('Making request to Slack OAuth API...');

    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'slack.com',
            port: 443,
            path: '/api/oauth.v2.access',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            console.log('Received response from Slack. Status:', res.statusCode);

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                console.log('Received full response from Slack');
                try {
                    const response = JSON.parse(data);
                    console.log('Parsed response:', JSON.stringify(response, null, 2));
                    
                    if (!response.ok) {
                        console.error('Slack OAuth error:', response.error);
                        resolve({
                            statusCode: 400,
                            body: JSON.stringify({ 
                                error: response.error || 'OAuth failed',
                                details: response.error_description
                            })
                        });
                        return;
                    }

                    const result = {
                        success: true,
                        team_id: response.team?.id,
                        team_name: response.team?.name,
                        bot_user_id: response.bot_user_id,
                        scope: response.scope,
                        access_token: response.access_token,
                        token_type: response.token_type
                    };

                    if (response.authed_user) {
                        result.authed_user = {
                            id: response.authed_user.id,
                            scope: response.authed_user.scope,
                            token_type: response.authed_user.token_type
                        };
                    }

                    console.log('OAuth successful for team:', result.team_name);
                    
                    // Remove sensitive data before sending to client
                    delete result.access_token;
                    if (result.authed_user) {
                        delete result.authed_user.access_token;
                    }

                    resolve({
                        statusCode: 200,
                        body: JSON.stringify(result)
                    });
                } catch (error) {
                    console.error('Failed to parse Slack response:', error);
                    resolve({
                        statusCode: 500,
                        body: JSON.stringify({ error: 'Failed to parse response' })
                    });
                }
            });
        });

        req.on('error', (error) => {
            console.error('Request error:', error);
            resolve({
                statusCode: 500,
                body: JSON.stringify({ error: 'Request failed' })
            });
        });

        req.write(postData);
        req.end();
    });
};