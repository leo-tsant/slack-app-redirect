const { Client } = require('pg');

async function testConnection() {
    const client = new Client(process.env.DATABASE_URL);
    
    try {
        console.log('Attempting to connect to database...');
        await client.connect();
        console.log('Successfully connected to database!');
        
        // Test query
        const result = await client.query('SELECT NOW()');
        console.log('Current database time:', result.rows[0].now);
        
    } catch (error) {
        console.error('Connection error:', {
            message: error.message,
            code: error.code,
            stack: error.stack
        });
    } finally {
        await client.end();
    }
}

testConnection(); 