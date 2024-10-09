const fs = require('fs');
const FormData = require('form-data');
const axios = require('axios');

// Fungsi untuk membaca instruksi dari file txt
function loadInstructionsFromFile(filePath) {
    try {
        const instructions = fs.readFileSync(filePath, 'utf-8');
        return instructions.trim();
    } catch (error) {
        console.error('Error reading instructions from file:', error);
        return ''; // Kembalikan string kosong jika terjadi error
    }
}

// Fungsi untuk mengunggah gambar ke OpenAI tanpa menyimpan secara lokal
async function uploadImageToOpenAI(media) {
    try {
        const form = new FormData();
        const buffer = Buffer.from(media.data, 'base64');

        form.append('file', buffer, {
            filename: 'image.jpg', // Anda bisa menggunakan nama file apa pun
            contentType: media.mimetype
        });
        form.append('purpose', 'vision'); // Sesuaikan 'purpose' jika diperlukan

        const response = await axios.post('https://api.openai.com/v1/files', form, {
            headers: {
                ...form.getHeaders(),
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });

        if (response.data && response.data.id) {
            return response.data.id;
        } else {
            console.error('Failed to upload image to OpenAI:', response.data);
            return null;
        }
    } catch (error) {
        console.error('Error uploading image to OpenAI:', error.response ? error.response.data : error.message);
        return null;
    }
}

module.exports = {
    loadInstructionsFromFile,
    uploadImageToOpenAI
};
