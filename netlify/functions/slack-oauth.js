const https = require('https');
const querystring = require('querystring');

let pg;
try {
    pg = require('pg');
    console.log('[DEBUG] PostgreSQL package loaded successfully');
} catch (error) {
    console.log('[DEBUG] PostgreSQL package not available:', error.message);
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

    // Store the token in your database if available
    if (pg && process.env.DATABASE_URL) {
        console.log('[DEBUG] Database configuration present, attempting to store token');
        try {
            await storeWorkspaceToken(tokenResponse);
            console.log('[DEBUG] Token stored successfully');
        } catch (error) {
            console.error('[DEBUG] Failed to store token in database:', {
                message: error.message,
                code: error.code,
                stack: error.stack,
                databaseUrl: process.env.DATABASE_URL ? 'Present' : 'Missing'
            });
        }
    } else {
        console.log('[DEBUG] Database storage not configured:', {
            pgAvailable: !!pg,
            databaseUrlPresent: !!process.env.DATABASE_URL
        });
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
    if (!pg || !process.env.DATABASE_URL) {
        console.log('[DEBUG] Database storage not configured');
        return;
    }

    console.log('[DEBUG] Attempting database connection with connection string');
    const client = new pg.Client(process.env.DATABASE_URL);

    try {
        console.log('[DEBUG] Connecting to database...');
        await client.connect();
        console.log('[DEBUG] Database connection successful');
        
        // Create table if it doesn't exist
        await client.query(`
            CREATE TABLE IF NOT EXISTS slack_workspaces (
                team_id TEXT PRIMARY KEY,
                team_name TEXT,
                bot_token TEXT,
                bot_user_id TEXT,
                app_id TEXT,
                scopes TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('[DEBUG] Table check/creation completed');
        
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
        
        console.log('[DEBUG] Executing query with values:', {
            teamId: tokenData.team?.id,
            teamName: tokenData.team?.name,
            hasToken: !!tokenData.access_token,
            botUserId: tokenData.bot_user_id,
            appId: tokenData.app_id,
            hasScope: !!tokenData.scope
        });

        const result = await client.query(query, values);
        console.log('[DEBUG] Query executed successfully:', {
            rowsAffected: result.rowCount,
            teamName: result.rows[0]?.team_name
        });
        
    } catch (error) {
        console.error('[DEBUG] Database error details:', {
            message: error.message,
            code: error.code,
            stack: error.stack,
            connectionString: process.env.DATABASE_URL ? 'Present' : 'Missing',
            connectionStringLength: process.env.DATABASE_URL?.length
        });
        throw error;
    } finally {
        try {
            await client.end();
            console.log('[DEBUG] Database connection closed');
        } catch (error) {
            console.error('[DEBUG] Error closing database connection:', error.message);
        }
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