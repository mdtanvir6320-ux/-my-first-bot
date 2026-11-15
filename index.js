const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const pino = require('pino');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

async function start() {
    const { state, saveCreds } = await useMultiFileAuthState('auth');
    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: state,
        browser: ['Karerhat Bot', 'Chrome', '1.0']
    });

    sock.ev.on('creds.update', saveCreds);

    // Pairing Code - ফোনে কোড যাবে
    if (!sock.authState.creds.registered) {
        const phone = (process.env.PHONE_NUMBER || '').replace(/[^0-9]/g, '');
        if (phone) {
            setTimeout(async () => {
                try {
                    const code = await sock.requestPairingCode(phone);
                    console.log('=== PAIRING CODE: ' + code + ' ===');
                    console.log('WhatsApp > Linked Devices > Link with phone number > এই কোডটা দাও');
                } catch (e) { console.log('Pairing Error:', e.message); }
            }, 3000);
        } else {
            console.log('PHONE_NUMBER env দাও! যেমন 8801712345678');
        }
    }

    sock.ev.on('connection.update', (u) => {
        const { connection, lastDisconnect } = u;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed, reconnect:', shouldReconnect);
            if (shouldReconnect) start();
        } else if (connection === 'open') {
            console.log('✅ BOT CONNECTED! বট চালু!');
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;
        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        if (!text) return;
        const t = text.trim().toLowerCase();
        console.log('Msg:', text);

        // মেনু বট - ফাস্ট রিপ্লাই
        if (t === 'hi' || t === 'hello' || t === '1') {
            await sock.sendMessage(from, { text: 'আসসালামু আলাইকুম! 👋\nআমি Karerhat AI Bot\n\n1️⃣ দাম জানতে 1 লিখুন\n2️⃣ অর্ডার করতে 2 লিখুন\n3️⃣ AI এর সাথে কথা বলতে যেকোনো প্রশ্ন লিখুন' });
            return;
        }
        if (t === '2') {
            await sock.sendMessage(from, { text: 'অর্ডার করতে আপনার নাম, ঠিকানা আর কি লাগবে লিখে পাঠান। আমরা কল দিবো ইনশাআল্লাহ।' });
            return;
        }

        // Gemini AI - বাকি সব প্রশ্নের জন্য
        try {
            const result = await model.generateContent(`তুমি Karerhat এর একটা দোকানের হেল্পফুল বাংলা AI অ্যাসিস্ট্যান্ট। ছোট করে, বন্ধুর মতো বাংলায় জবাব দাও। প্রশ্ন: ${text}`);
            const reply = result.response.text();
            await sock.sendMessage(from, { text: reply });
        } catch (e) {
            console.log('Gemini Error:', e.message);
            await sock.sendMessage(from, { text: 'দুঃখিত, একটু সমস্যা হইছে। আবার লিখুন।' });
        }
    });
}
start();
