require('dotenv').config();
const { OpenAI } = require('openai');
const path = require('path');
const fs = require('fs');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const ASSISTANT_ID = process.env.ASSISTANT_ID;
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'];
const TOKEN_PATH = 'token.json';

const sessionPath = path.resolve(__dirname, '.wwebjs_auth', 'test7');

if (!fs.existsSync(sessionPath)) {
    fs.mkdirSync(sessionPath, { recursive: true });
}

const admins = ['62895619356936', '628998314071', '6282310984336']; // Sesuaikan dengan nomor admin Anda

module.exports = {
    openai,
    ASSISTANT_ID,
    SCOPES,
    TOKEN_PATH,
    sessionPath,
    admins
};
