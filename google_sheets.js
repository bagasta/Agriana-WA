// google_sheet.js
const fs = require('fs');
const { google } = require('googleapis');
const readline = require('readline');
const { SCOPES, TOKEN_PATH, openai, ASSISTANT_ID } = require('./config'); // Pastikan path benar

// Fungsi untuk otorisasi Google API
async function authorize(credentials) {
    const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    if (fs.existsSync(TOKEN_PATH)) {
        const token = fs.readFileSync(TOKEN_PATH);
        oAuth2Client.setCredentials(JSON.parse(token));
        try {
            await oAuth2Client.getAccessToken();
        } catch (error) {
            return getNewToken(oAuth2Client);
        }
    } else {
        return getNewToken(oAuth2Client);
    }
    return oAuth2Client;
}

function getNewToken(oAuth2Client) {
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
    });
    console.log('Authorize this app by visiting this url:', authUrl);
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve, reject) => {
        rl.question('Enter the code from that page here: ', async (code) => {
            rl.close();
            try {
                const { tokens } = await oAuth2Client.getToken(code.trim());
                oAuth2Client.setCredentials(tokens);
                fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
                console.log('Token stored to', TOKEN_PATH);
                resolve(oAuth2Client);
            } catch (error) {
                console.error('Error retrieving access token', error);
                reject(error);
            }
        });
    });
}

// Fungsi untuk mendapatkan informasi pengguna dari sheet "list-nomer"
async function getUserInfo(phoneNumber) {
    const credentials = JSON.parse(fs.readFileSync('client_secret_416631945272-od5n6a3lehtlp4p3sa4766kjegh3atgv.apps.googleusercontent.com.json')); // Pastikan nama file kredensial Anda benar
    const auth = await authorize(credentials);
    const sheets = google.sheets({ version: 'v4', auth });

    // Mengakses sheet "list-nomer" dan range A:C (Kolom A sampai C)
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: 'list-nomer!A:C',
    });

    // Mengambil data baris dari response
    const rows = response.data.values;
    if (rows && rows.length) {
        for (let row of rows) {
            // Memeriksa apakah nomor telepon (Kolom A) cocok dengan phoneNumber
            if (row[0] === phoneNumber) {
                const department = row[1] || ''; // Departemen ada di Kolom B (indeks 1)
                const topic = row[2] || '';       // Topik ada di Kolom C (indeks 2)
                return {
                    department: department.trim(),
                    topic: topic.trim(),
                };
            }
        }
    }
    return null; // Jika nomor telepon tidak ditemukan, kembalikan null
}

// Fungsi untuk menyimpan pesan ke Google Sheets
async function saveMessageToGoogleSheets(phoneNumber, messageContent, threadId, groupId, groupName, contactName) {
    console.log('Saving message to Google Sheets:', phoneNumber, messageContent, threadId, groupId, groupName, contactName);
    const credentials = JSON.parse(fs.readFileSync('client_secret_416631945272-od5n6a3lehtlp4p3sa4766kjegh3atgv.apps.googleusercontent.com.json')); // Sesuaikan dengan nama file kredensial Anda
    const auth = await authorize(credentials);
    const sheets = google.sheets({ version: 'v4', auth });

    const timestamp = new Date().toISOString();

    // Urutan kolom: Phone Number, Message Content, Thread ID, Group ID, Group Name, Contact Name, Timestamp
    const values = [[phoneNumber, messageContent, threadId, groupId, groupName, contactName, timestamp]];

    const resource = { values };

    try {
        await sheets.spreadsheets.values.append({
            spreadsheetId: process.env.SPREADSHEET_ID,
            range: 'test-db!A:G', // Sesuaikan dengan nama sheet dan range Anda
            valueInputOption: 'RAW',
            insertDataOption: 'INSERT_ROWS',
            resource,
        });
        console.log('Message has been saved to Google Sheets.');
    } catch (error) {
        console.error('Error saving message to Google Sheets:', error);
    }
}

// Fungsi untuk mendapatkan atau membuat thread ID
async function getOrCreateThreadId(identifier) {
    const credentials = JSON.parse(fs.readFileSync('client_secret_416631945272-od5n6a3lehtlp4p3sa4766kjegh3atgv.apps.googleusercontent.com.json')); // Sesuaikan dengan nama file kredensial Anda
    const auth = await authorize(credentials);
    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: 'test-db!A:B', // Sesuaikan dengan nama sheet Anda
    });

    console.log('Google Sheets API response:', response.data);

    const rows = response.data.values;
    if (rows && rows.length) {
        for (let row of rows) {
            if (row[1] === identifier) {
                return row[0];
            }
        }
    }

    // Jika tidak ditemukan, buat thread baru menggunakan OpenAI beta API
    const thread = await openai.beta.threads.create(); // Pastikan `openai` diimpor dengan benar
    const threadId = thread.id;

    // Simpan threadId dan identifier ke Google Sheets
    await saveThreadToGoogleSheets(identifier, threadId);

    return threadId;
}

// Fungsi untuk menyimpan thread ID ke Google Sheets
async function saveThreadToGoogleSheets(identifier, threadId) {
    const credentials = JSON.parse(fs.readFileSync('client_secret_416631945272-od5n6a3lehtlp4p3sa4766kjegh3atgv.apps.googleusercontent.com.json')); // Sesuaikan dengan nama file kredensial Anda
    const auth = await authorize(credentials);
    const sheets = google.sheets({ version: 'v4', auth });

    const resource = {
        values: [
            [threadId, identifier]
        ],
    };

    try {
        await sheets.spreadsheets.values.append({
            spreadsheetId: process.env.SPREADSHEET_ID,
            range: 'test-db!A:B', // Sesuaikan dengan nama sheet Anda
            valueInputOption: 'RAW',
            insertDataOption: 'INSERT_ROWS',
            resource,
        });
        console.log('Thread ID and identifier saved to Google Sheets.');
    } catch (error) {
        console.error('Error saving thread to Google Sheets:', error);
    }
}

module.exports = {
    authorize,
    getUserInfo,
    saveMessageToGoogleSheets,
    getOrCreateThreadId,
    saveThreadToGoogleSheets
};
