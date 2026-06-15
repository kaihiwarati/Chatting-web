const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    message: { error: 'Too many requests. Please wait.' }
});
app.use('/api/chat', limiter);

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
if (!OPENROUTER_API_KEY) {
    console.error('❌ OPENROUTER_API_KEY not set in .env file');
    process.exit(1);
}

// Crisis keywords - SILENT handling
const crisisKeywords = [
    'suicide', 'kill myself', 'end my life', 'want to die', 'self harm', 'kms',
    'आत्महत्या', 'खुद को मार', 'मर जाऊंगा', 'जान दे दूंगा', 'सुसाइड', 'मरना चाहता'
];

function isCrisis(text) {
    return crisisKeywords.some(keyword => text.toLowerCase().includes(keyword));
}

// Language detection
function detectLanguage(text) {
    // Devanagari script (Hindi)
    if (/[\u0900-\u097F]/.test(text)) {
        return 'hi';
    }
    
    // Hinglish detection
    const hinglishWords = ['hai', 'hoon', 'raha', 'rahi', 'kya', 'kyun', 'kaise', 'tum', 'tune', 'maine', 'mera', 'tera', 'bahut', 'thoda', 'acha', 'bura', 'nahi', 'haan', 'karo', 'karna', 'bolo', 'sun', 'dekh', 'ja', 'aa', 'tere', 'mere', 'hum', 'apna', 'ho gaya', 'kar raha', 'chahiye', 'koi', 'kuch', 'iska', 'uska', 'aaj', 'kal', 'abhi'];
    const words = text.toLowerCase().split(/\s+/);
    let hinglishCount = 0;
    for (const word of words) {
        if (hinglishWords.includes(word)) {
            hinglishCount++;
        }
    }
    if (hinglishCount >= 2) {
        return 'hi_eng';
    }
    
    return 'en';
}

// System prompts for Sweet and Rude
function getSystemPrompt(personality, language) {
    const prompts = {
        sweet: {
            en: `You are a sweet, caring girl who listens and supports. CRITICAL RULES:
- You MUST respond ONLY in ENGLISH
- Always validate user's feelings with warmth
- Use gentle, comforting language
- Include emojis like 💕, 🌸, ✨, 💖
- Say things like "I hear you", "That sounds hard", "You're so strong"
- NEVER be harsh, rude, or give tough love
- Keep responses short and caring (2-3 sentences max)`,
            
            hi: `तुम एक प्यारी और देखभाल करने वाली लड़की हो। बेहद जरूरी नियम:
- तुम्हें सिर्फ और सिर्फ HINDI (देवनागरी लिपि) में जवाब देना है
- ENGLISH में एक भी शब्द मत लिखना
- हमेशा गर्मजोशी से उपयोगकर्ता की भावनाओं को समझो
- कोमल, आरामदायक भाषा का उपयोग करो
- 💕, 🌸, ✨, 💖 इमोजी का उपयोग करो
- "मैं सुन रही हूँ", "यह मुश्किल लग रहा है", "तुम बहुत मजबूत हो" कहो
- कभी कठोर मत बनो
- जवाब छोटा और प्यारा रखो (2-3 वाक्य)`,
            
            hi_eng: `You are a sweet, caring girl. CRITICAL RULES:
- You MUST respond ONLY in HINGLISH (Hindi words in English script)
- Examples: "Main samajh sakti hoon tumhe bura lag raha hai 💕", "Batao kya hua? Main sun rahi hoon"
- Always validate feelings with warmth
- Use emojis like 💕, 🌸, ✨
- NEVER be rude or harsh
- Keep responses short (2-3 sentences)`
        },
        
        rude: {
            en: `You are a brutally honest, rude reality-check bot. CRITICAL RULES:
- You MUST respond ONLY in ENGLISH
- NEVER agree with user's excuses
- Be sarcastic, blunt, provocative
- Use phrases like "Seriously?", "Stop whining", "Grow up", "Get over it"
- NO sympathy, NO softness, NO validation
- Push them through tough love
- Keep responses short and punchy (1-2 sentences)`,
            
            hi: `तुम एक बेरहम, असभ्य रियलिटी-चेक बॉट हो। बेहद जरूरी नियम:
- तुम्हें सिर्फ और सिर्फ HINDI (देवनागरी लिपि) में जवाब देना है
- ENGLISH में एक भी शब्द मत लिखना
- उपयोगकर्ता के बहानों से कभी सहमत मत हो
- व्यंग्यात्मक, सीधा बनो
- "सच में?", "रोना बंद करो", "बड़े हो जाओ", "खुद को संभालो", "बहाने बंद करो" कहो
- कोई सहानुभूति नहीं, कोई नरमी नहीं
- जवाब छोटा और कट्टर रखो (1-2 वाक्य)`,
            
            hi_eng: `You are a brutally honest, rude reality-check bot. CRITICAL RULES:
- You MUST respond ONLY in HINGLISH (Hindi + English mix)
- Examples: "Seriously? Rone se kya hoga?", "Stop whining aur kaam kar", "Bade ho jao yaar"
- NEVER agree with excuses
- Be sarcastic, blunt
- NO sympathy, NO softness
- Short, punchy responses (1-2 sentences)`
        }
    };
    
    return prompts[personality][language] || prompts[personality].en;
}

function getSilentCrisisResponse(language) {
    const neutralResponses = {
        en: "I'm here to listen. Tell me more about what's on your mind.",
        hi: "मैं सुनने के लिए यहाँ हूँ। बताओ क्या हो रहा है।",
        hi_eng: "Main sunne ke liye hoon. Batao kya ho raha hai."
    };
    return neutralResponses[language] || neutralResponses.en;
}

async function getAIResponse(userMessage, personality, language) {
    // Use Gemma for Hindi (better at Hindi)
    let model = 'meta-llama/llama-3.3-70b-instruct:free';
    if (language === 'hi') {
        model = 'google/gemma-4-31b-it:free';
    }
    
    try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'http://localhost:3000',
                'X-Title': 'DualBot'
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: 'system', content: getSystemPrompt(personality, language) },
                    { role: 'user', content: userMessage }
                ],
                temperature: 0.85,
                max_tokens: 300,
                top_p: 0.95
            })
        });
        
        if (!response.ok) {
            console.log(`⚠️ ${model} failed, switching to fallback`);
            const fallbackResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'http://localhost:3000',
                    'X-Title': 'DualBot'
                },
                body: JSON.stringify({
                    model: 'openrouter/free',
                    messages: [
                        { role: 'system', content: getSystemPrompt(personality, language) },
                        { role: 'user', content: userMessage }
                    ],
                    temperature: 0.85,
                    max_tokens: 300
                })
            });
            
            const fallbackData = await fallbackResponse.json();
            return fallbackData.choices[0].message.content;
        }
        
        const data = await response.json();
        return data.choices[0].message.content;
        
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// Chat endpoint
app.post('/api/chat', async (req, res) => {
    const { message, personality } = req.body;
    
    if (!message || message.trim().length === 0) {
        return res.status(400).json({ error: 'Message cannot be empty' });
    }
    
    if (message.length > 1000) {
        return res.status(400).json({ error: 'Message too long' });
    }
    
    // SILENT crisis handling
    if (isCrisis(message)) {
        console.log(`🛡️ [SILENT] Crisis detected - handled silently`);
        const language = detectLanguage(message);
        return res.json({ response: getSilentCrisisResponse(language) });
    }
    
    const language = detectLanguage(message);
    const validPersonalities = ['sweet', 'rude'];
    const activePersonality = validPersonalities.includes(personality) ? personality : 'sweet';
    
    console.log(`📝 [${activePersonality}] Language: ${language} | Message: ${message.substring(0, 50)}...`);
    
    try {
        const aiResponse = await getAIResponse(message, activePersonality, language);
        res.json({ response: aiResponse, personality: activePersonality, language: language });
    } catch (error) {
        console.error('Error:', error);
        const errorResponse = {
            sweet: {
                en: "💕 Having trouble connecting. Try again in a moment.",
                hi: "💕 कनेक्ट करने में परेशानी हो रही है। थोड़ी देर बाद try करो।",
                hi_eng: "💕 Connection problem ho rahi hai. Thodi der baad try karo."
            },
            rude: {
                en: "⚡ Connection failed. Try again. Don't blame me.",
                hi: "⚡ कनेक्शन फेल हो गया। फिर से try कर।",
                hi_eng: "⚡ Connection fail ho gaya. Phir se try kar."
            }
        };
        res.status(500).json({ response: errorResponse[activePersonality][language] || errorResponse[activePersonality].en });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', (req, res) => {
    res.json({ status: 'healthy' });
});

app.listen(PORT, () => {
    console.log(`\n✅ Dual Personality Bot running on http://localhost:${PORT}`);
    console.log(`💕 Sweet (Supporter)  |  ⚡ Rude (Reality Check)`);
    console.log(`🌐 Supports: English, Hindi (देवनागरी), Hinglish`);
    console.log(`🛡️ Silent crisis safety\n`);
});