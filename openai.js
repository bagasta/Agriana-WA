// openai.js
const { openai, ASSISTANT_ID } = require('./config');
const { loadInstructionsFromFile } = require('./utils');

async function sendMessageToThread(threadId, messageContent, senderName, userInfo, fileId = null) {
    console.log(`Mengirim pesan ke thread ${threadId}: ${messageContent}`);
    try {
        // Muat instruksi terbaru
        const instructions = loadInstructionsFromFile('instructions.txt');

        // Siapkan pesan sistem berdasarkan informasi pengguna
        let systemMessage = `${instructions}\n\n`;

        if (userInfo) {
            systemMessage += `Catatan: Pengguna ini berasal dari departemen "${userInfo.department}". Mereka diizinkan untuk membahas topik berikut: "${userInfo.topic}". Anda hanya boleh menjawab pertanyaan yang terkait dengan topik tersebut. Jika pengguna menanyakan pertanyaan di luar topik, tolak dengan sopan.`;
        } else {
            systemMessage += `Catatan: Pengguna ini adalah "Orang Umum". Anda hanya boleh menjawab pertanyaan umum dan menolak dengan sopan pertanyaan yang bersifat khusus atau sensitif.`;
        }
        

        await openai.beta.threads.messages.create(threadId, {
            role: 'assistant',
            content: [  
                { "type": "text", "text": systemMessage }
            ]
        });

        // Tambahkan nama pengirim ke konten pesan
        const formattedMessageContent = `${senderName}: ${messageContent}`;

        // Tambahkan pesan pengguna terbaru
        let userMessageContent = [
            { "type": "text", "text": formattedMessageContent }
        ];

        if (fileId) {
            userMessageContent.push({
                "type": "image_file",
                "image_file": { "file_id": fileId }
            });
        }

        // Tambahkan pesan pengguna ke thread
        await openai.beta.threads.messages.create(threadId, {
            role: 'user',
            content: userMessageContent
        });

        // Buat run baru dengan instruksi terbaru
        const run = await openai.beta.threads.runs.create(threadId, {
            assistant_id: ASSISTANT_ID,
            instructions: instructions
        });

        // Tunggu hingga run selesai
        let runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
        while (runStatus.status === "queued" || runStatus.status === "in_progress") {
            await new Promise(resolve => setTimeout(resolve, 1000));
            runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
        }

        // Dapatkan respons terbaru dari asisten
        const latestMessagesResponse = await openai.beta.threads.messages.list(threadId);
        const latestMessages = latestMessagesResponse.data;
        const latestAssistantMessage = latestMessages
            .filter(message => message.role === 'assistant')
            .reduce((prev, current) => (prev.created_at > current.created_at) ? prev : current, { created_at: 0 });

        if (latestAssistantMessage) {
            return latestAssistantMessage.content.map(content => content.text.value).join('\n');
        } else {
            return 'Tidak ada respons dari asisten.';
        }
    } catch (error) {
        console.error('Error saat mengirim pesan ke thread:', error);
        throw error;
    }
}

module.exports = {
    sendMessageToThread
};
