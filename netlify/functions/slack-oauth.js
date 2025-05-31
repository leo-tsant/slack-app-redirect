const https = require('https');
const querystring = require('querystring');
const { createClient } = require('@supabase/supabase-js');

let supabase;
try {
    supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY
    );
    console.log('[DEBUG] Supabase client initialized successfully');
} catch (error) {
    console.log('[DEBUG] Failed to initialize Supabase client:', error.message);
}

exports.handler = async (event, context) => {
    console.log('[DEBUG] Function started');
    console.log('[DEBUG] HTTP Method:', event.httpMethod);
    
    if (event.httpMethod !== 'POST') {
        console.log('[DEBUG] Invalid HTTP method');
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    let body;
    try {
        body = JSON.parse(event.body);
        console.log('[DEBUG] Request body parsed successfully');
    } catch (error) {
        console.log('[DEBUG] Failed to parse request body:', error.message);
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Invalid request body' })
        };
    }

    const { code, state } = body;
    console.log('[DEBUG] Authorization code received:', code ? 'Yes' : 'No');

    if (!code) {
        console.log('[DEBUG] Missing authorization code');
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Missing authorization code' })
        };
    }

    const clientId = process.env.SLACK_CLIENT_ID;
    const clientSecret = process.env.SLACK_CLIENT_SECRET;
    const redirectUri = process.env.SLACK_REDIRECT_URI || `${process.env.URL}/callback`;

    console.log('[DEBUG] Environment variables check:', {
        clientIdPresent: !!clientId,
        clientSecretPresent: !!clientSecret,
        redirectUri: redirectUri
    });

    if (!clientId || !clientSecret) {
        console.error('[DEBUG] Missing Slack credentials in environment variables');
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Server configuration error' })
        };
    }

    // Exchange code for token
    console.log('[DEBUG] Attempting to exchange code for token');
    const tokenResponse = await exchangeCodeForToken(clientId, clientSecret, code, redirectUri);
    console.log('[DEBUG] Token exchange response:', {
        ok: tokenResponse.ok,
        error: tokenResponse.error,
        teamId: tokenResponse.team?.id
    });
    
    if (!tokenResponse.ok) {
        console.log('[DEBUG] Token exchange failed:', tokenResponse.error);
        return {
            statusCode: 400,
            body: JSON.stringify({ 
                error: tokenResponse.error || 'OAuth failed',
                details: tokenResponse.error_description
            })
        };
    }

    // Store the token in Supabase if available
    if (supabase) {
        console.log('[DEBUG] Supabase client available, attempting to store token');
        try {
            await storeWorkspaceToken(tokenResponse);
            console.log('[DEBUG] Token stored successfully');
        } catch (error) {
            console.error('[DEBUG] Failed to store token in Supabase:', {
                message: error.message,
                code: error.code,
                stack: error.stack
            });
        }
    } else {
        console.log('[DEBUG] Supabase storage not configured');
    }
    
    // Also send the token to n8n via webhook if needed
    if (process.env.N8N_WEBHOOK_URL) {
        console.log('[DEBUG] N8N webhook URL present, attempting to notify');
        try {
            await notifyN8n(tokenResponse);
            console.log('[DEBUG] N8N notification sent successfully');
        } catch (error) {
            console.error('[DEBUG] Failed to notify n8n:', error.message);
        }
    }

    console.log('[DEBUG] OAuth flow completed successfully');
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
    if (!supabase) {
        console.log('[DEBUG] Supabase client not available');
        return;
    }

    try {
        // Create table if it doesn't exist
        const { error: createTableError } = await supabase.rpc('create_slack_workspaces_table');
        if (createTableError) {
            console.log('[DEBUG] Table creation error:', createTableError);
        }

        // Upsert the workspace token
        const { data, error } = await supabase
            .from('slack_workspaces')
            .upsert({
                team_id: tokenData.team?.id,
                team_name: tokenData.team?.name,
                bot_token: tokenData.access_token,
                bot_user_id: tokenData.bot_user_id,
                app_id: tokenData.app_id,
                scopes: tokenData.scope,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'team_id'
            });

        if (error) {
            console.error('[DEBUG] Supabase upsert error:', error);
            throw error;
        }

        console.log('[DEBUG] Token stored successfully:', {
            teamId: tokenData.team?.id,
            teamName: tokenData.team?.name
        });

    } catch (error) {
        console.error('[DEBUG] Failed to store token:', error);
        throw error;
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