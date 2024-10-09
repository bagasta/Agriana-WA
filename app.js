require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const fs = require('fs');
const { sessionPath, admins } = require('./config');
const { uploadImageToOpenAI, loadInstructionsFromFile } = require('./utils');
const { getUserInfo, saveMessageToGoogleSheets, getOrCreateThreadId } = require('./google_sheets');
const { sendMessageToThread } = require('./openai');

const app = express();
const port = process.env.PORT || 3000;
const userStatus = {};
let botActive = true;

const client = new Client({
    authStrategy: new LocalAuth({
        clientId: "test7"
    }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ],
    },
    webVersionCache: { type: 'remote', remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2413.51-beta.html' }
});

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
    console.log('Client is ready!');
    // Tidak perlu memuat threads karena OpenAI beta API mengelola pesan
});

client.on('message', async msg => {

    // Abaikan pesan yang dikirim oleh bot
    if (msg.fromMe) {
        return;
    }

    const botNumber = '6282299312107@c.us'; // Ganti dengan nomor bot Anda
    const isGroupMsg = msg.from.endsWith('@g.us');
    const mentionsBot = msg.mentionedIds.includes(botNumber);

    console.log(`Received message from ${msg.from}: ${msg.body}`);
    console.log(`isGroupMsg: ${isGroupMsg}, mentionsBot: ${mentionsBot}`);

    let phoneNumber;
    let messageContent = msg.body ? msg.body.trim() : '';
    let groupId = '';
    let groupName = '';
    let contactName = '';
    let identifier;

    // Dapatkan informasi kontak
    const contact = await msg.getContact();
    contactName = contact.pushname || contact.verifiedName || contact.formattedName || '';

    if (isGroupMsg) {
        if (msg.author) {
            phoneNumber = msg.author.split('@')[0]; // Nomor pengirim
        } else {
            console.error('Author not found in group message.');
            return;
        }

        groupId = msg.from;
        const chat = await msg.getChat();
        groupName = chat.name;

        if (!mentionsBot) {
            console.log('Bot was not mentioned in a group message, ignoring...');
            return;
        }

        identifier = groupId; // Gunakan groupId sebagai identifier

        // Dapatkan informasi pengguna
        const userInfo = await getUserInfo(phoneNumber);
        msg.userInfo = userInfo;

    } else {
        // Untuk pesan pribadi, gunakan msg.from
        phoneNumber = msg.from.split('@')[0];
        identifier = phoneNumber; // Gunakan phoneNumber sebagai identifier

        // Dapatkan informasi pengguna
        const userInfo = await getUserInfo(phoneNumber);
        msg.userInfo = userInfo;
    }

    // Cek apakah pengirim adalah admin
    if (admins.includes(phoneNumber)) {
        if (messageContent.toLowerCase() === '#start') {
            botActive = true;
            msg.reply('Bot is now active.');
            Object.keys(userStatus).forEach(key => userStatus[key].notified = false);
            return;
        } else if (messageContent.toLowerCase() === '#stop') {
            botActive = false;
            msg.reply('Bot is now inactive.');
            return;
        }
    }

    if (!botActive) {
        if (!userStatus[msg.from]) {
            userStatus[msg.from] = {};
        }

        if (!userStatus[msg.from].notified) {
            msg.reply('Halo tunggu sebentar ya..');
            userStatus[msg.from].notified = true;
        }
        return;
    } else {
        if (!userStatus[msg.from]) {
            userStatus[msg.from] = { notified: false };
        }
    }

    // Proses pesan masuk
    try {
        const threadId = await getOrCreateThreadId(identifier);
        console.log(`Thread ID for ${identifier}: ${threadId}`);

        // Simpan pesan ke Google Sheets dengan data tambahan
        await saveMessageToGoogleSheets(phoneNumber, messageContent, threadId, groupId, groupName, contactName);

        if (msg.hasMedia) {
            const media = await msg.downloadMedia();
            if (media && media.mimetype.startsWith('image')) {
                msg.reply("Gambar telah diterima, sedang memproses...");

                const fileId = await uploadImageToOpenAI(media, process.env.OPENAI_API_KEY);

                if (fileId) {
                    console.log(`Gambar telah diunggah ke OpenAI dan sedang diproses dengan file_id: ${fileId}`);
                    let prompt;
                    if (messageContent) {
                        prompt = `Tolong lihat gambar ini dan\n\n${messageContent}`;
                    } else {
                        prompt = "Tolong lihat gambar ini";
                    }
                    // Kirim pesan dengan gambar ke thread yang sudah ada
                    const senderName = contactName || phoneNumber;
                    const userInfo = msg.userInfo; // Gunakan informasi pengguna yang telah disimpan
                    const response = await sendMessageToThread(threadId, prompt, senderName, userInfo, fileId);

                    console.log('Response from sendMessageToThread:', response); // Tambahkan ini

                    if (response && typeof response === 'string') { // Pastikan response adalah string
                        msg.reply(response);
                    } else {
                        console.log('Gagal mengirim gambar ke thread atau respons bukan string.');
                    }
                } else {
                    console.log("Gagal mengunggah gambar ke OpenAI.");
                }

                // Tidak perlu menghapus file karena tidak ada file yang disimpan secara lokal
            } else {
                msg.reply("Jenis media tidak didukung. Hanya gambar yang bisa diproses.");
            }
        } else if (messageContent) {
            const senderName = contactName || phoneNumber;
            const userInfo = msg.userInfo; // Gunakan informasi pengguna yang telah disimpan

            const response = await sendMessageToThread(threadId, messageContent, senderName, userInfo);
            console.log('Response from sendMessageToThread:', response); // Tambahkan ini

            if (response && typeof response === 'string') { // Pastikan response adalah string
                msg.reply(response).catch(error => console.error('Failed to send message:', error));
            } else {
                console.log('Gagal mengirim pesan atau respons bukan string.');
            }
        } else {
            msg.reply('😇').catch(error => console.error('Failed to send message:', error));
        }

    } catch (error) {
        console.error('Error processing the AI response:', error);
        await msg.reply('🙏🏻 Maaf, terjadi kesalahan saat memproses permintaan Anda.');
    }

});

client.initialize().then(() => {
    console.log('Client initialized successfully');
}).catch(error => {
    console.error('Error initializing client:', error);
});

app.get('/', (req, res) => res.send('WhatsApp bot is running'));
app.listen(port, () => console.log(`Server is running on port ${port}`));

console.log('Server setup complete, awaiting messages...');
