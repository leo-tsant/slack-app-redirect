const https = require('https');
const querystring = require('querystring');

const { Client } = require('pg');

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    let body;
    try {
        body = JSON.parse(event.body);
    } catch (error) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Invalid request body' })
        };
    }

    const { code, state } = body;

    if (!code) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Missing authorization code' })
        };
    }

    const clientId = process.env.SLACK_CLIENT_ID;
    const clientSecret = process.env.SLACK_CLIENT_SECRET;
    const redirectUri = process.env.SLACK_REDIRECT_URI || `${process.env.URL}/callback`;

    if (!clientId || !clientSecret) {
        console.error('Missing Slack credentials in environment variables');
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Server configuration error' })
        };
    }

    // Exchange code for token
    const tokenResponse = await exchangeCodeForToken(clientId, clientSecret, code, redirectUri);
    
    if (!tokenResponse.ok) {
        return {
            statusCode: 400,
            body: JSON.stringify({ 
                error: tokenResponse.error || 'OAuth failed',
                details: tokenResponse.error_description
            })
        };
    }

    // Store the token in your database
    try {
        await storeWorkspaceToken(tokenResponse);
        
        // Also send the token to n8n via webhook if needed
        if (process.env.N8N_WEBHOOK_URL) {
            await notifyN8n(tokenResponse);
        }
    } catch (error) {
        console.error('Failed to store token:', error);
        // Don't fail the OAuth flow, but log the error
    }

    // Return success (without exposing the token)
    return {
        statusCode: 200,
        body: JSON.stringify({
            success: true,
            team_id: tokenResponse.team?.id,
            team_name: tokenResponse.team?.name,
            bot_user_id: tokenResponse.bot_user_id,
            scope: tokenResponse.scope
        })
    };
};

async function exchangeCodeForToken(clientId, clientSecret, code, redirectUri) {
    return new Promise((resolve, reject) => {
        const postData = querystring.stringify({
            client_id: clientId,
            client_secret: clientSecret,
            code: code,
            redirect_uri: redirectUri
        });

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
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (error) {
                    reject(error);
                }
            });
        });

        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

async function storeWorkspaceToken(tokenData) {
    // Connect to your PostgreSQL database
    const client = new Client({
        connectionString: process.env.DATABASE_URL, // Add this to your Netlify env vars
    });

    try {
        await client.connect();
        
        // Upsert the workspace token
        const query = `
            INSERT INTO slack_workspaces (team_id, team_name, bot_token, bot_user_id, app_id, scopes)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (team_id) 
            DO UPDATE SET 
                bot_token = $3,
                team_name = $2,
                updated_at = CURRENT_TIMESTAMP
            RETURNING *;
        `;
        
        const values = [
            tokenData.team?.id,
            tokenData.team?.name,
            tokenData.access_token,
            tokenData.bot_user_id,
            tokenData.app_id,
            tokenData.scope
        ];
        
        const result = await client.query(query, values);
        console.log('Token stored for workspace:', result.rows[0].team_name);
        
    } finally {
        await client.end();
    }
}

async function notifyN8n(tokenData) {
    // Optional: Notify n8n about the new installation
    const webhookUrl = process.env.N8N_WEBHOOK_URL;
    
    const data = JSON.stringify({
        event: 'app_installed',
        team_id: tokenData.team?.id,
        team_name: tokenData.team?.name,
        bot_user_id: tokenData.bot_user_id
    });

    // Send webhook to n8n
    return new Promise((resolve, reject) => {
        const url = new URL(webhookUrl);
        const options = {
            hostname: url.hostname,
            port: url.port || 443,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        };

        const req = https.request(options, (res) => {
            res.on('data', () => {}); // Consume response
            res.on('end', resolve);
        });

        req.on('error', reject);
        req.write(data);
        req.end();
    });
}