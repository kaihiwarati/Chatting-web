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
app.use(express.static(__dirname));

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    message: { error: 'Too many requests. Please wait.' }
});
app.use('/api/chat', limiter);

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
if (!OPENROUTER_API_KEY) {
    console.warn('⚠️ OPENROUTER_API_KEY not set');
}

// Crisis keywords
const crisisKeywords = [
    'suicide', 'kill myself', 'end my life', 'want to die', 'self harm', 'kms',
    'आत्महत्या', 'खुद को मार', 'मर जाऊंगा', 'जान दे दूंगा', 'सुसाइड', 'मरना चाहता'
];

function isCrisis(text) {
    return crisisKeywords.some(keyword => text.toLowerCase().includes(keyword));
}

// Improved language detection
function detectLanguage(text) {
    // Check for Devanagari script (Hindi)
    if (/[\u0900-\u097F]/.test(text)) {
        return 'hi';
    }
    
    // Check for Hinglish
    const hinglishWords = ['hai', 'hoon', 'raha', 'rahi', 'kya', 'kyun', 'kaise', 'tum', 'tune', 'maine', 'mera', 'tera', 'bahut', 'thoda', 'acha', 'bura', 'nahi', 'haan', 'karo', 'karna', 'bolo', 'sun', 'dekh', 'ja', 'aa', 'tere', 'mere', 'hum', 'apna', 'ho gaya', 'kar raha', 'chahiye', 'koi', 'kuch'];
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

// STRONGER system prompts - FORCE Hindi response
function getSystemPrompt(personality, language) {
    // If language is Hindi or Hinglish, STRICTLY force Hindi/Hinglish response
    if (language === 'hi') {
        return `तुम एक ${personality === 'sweet' ? 'प्यारी और देखभाल करने वाली लड़की' : 'बेरहम और सीधा बोलने वाला बॉट'} हो।

बहुत जरूरी नियम - इन्हें तोड़ना मत:
1. तुम्हें सिर्फ और सिर्फ शुद्ध HINDI (देवनागरी लिपि) में जवाब देना है
2. ENGLISH में एक भी शब्द मत लिखना - बिल्कुल नहीं
3. कोई अंग्रेजी शब्द नहीं, कोई अंग्रेजी वाक्य नहीं
4. पूरा जवाब हिंदी में लिखो

${personality === 'sweet' ? 
'तुम प्यारी हो - गर्मजोशी से बात करो, 💕 इमोजी use करो, जवाब छोटा रखो (2-3 वाक्य)' : 
'तुम रूड हो - सीधा बोलो, व्यंग्य करो, "रोना बंद कर", "बड़ा हो जा" कहो, कोई सहानुभूति नहीं'}

याद रखो: अगर उपयोगकर्ता हिंदी में पूछे तो हिंदी में जवाब देना ही तुम्हारा एकमात्र काम है।`;
    }
    
    if (language === 'hi_eng') {
        return `You are a ${personality === 'sweet' ? 'sweet, caring girl' : 'rude, blunt bot'}.

CRITICAL RULES - MUST FOLLOW:
1. You MUST respond ONLY in HINGLISH (Hindi words written in English script)
2. Use primarily Hindi words, only use English words when needed
3. Examples of CORRECT responses:
   - "Main samajh sakti hoon tumhe bura lag raha hai 💕"
   - "Dekho, rone se kya hoga? Kaam karo"
   - "Seriously? Tum khud ko sambhalo yaar"

${personality === 'sweet' ? 
'Be warm, caring, use 💕 emoji' : 
'Be blunt, sarcastic, no sympathy'}

NEVER respond in pure English. ALWAYS use Hinglish.`;
    }
    
    // English prompt
    return `You are a ${personality === 'sweet' ? 'sweet, caring girl' : 'rude, blunt bot'}.
Respond ONLY in ENGLISH.
${personality === 'sweet' ? 'Be warm, validating, use 💕 emoji. Short responses (2-3 sentences).' : 'Be blunt, sarcastic, no sympathy. Short, punchy responses.'}
NEVER be neutral - always lean into your personality.`;
}

function getSilentCrisisResponse(language) {
    const responses = {
        en: "I'm here to listen. Tell me more about what's on your mind.",
        hi: "मैं सुनने के लिए यहाँ हूँ। बताओ क्या हो रहा है।",
        hi_eng: "Main sunne ke liye hoon. Batao kya ho raha hai."
    };
    return responses[language] || responses.en;
}

async function getAIResponse(userMessage, personality, language) {
    if (!OPENROUTER_API_KEY) {
        return getSilentCrisisResponse(language);
    }
    
    // Use models that are good at Hindi
    let model = 'google/gemma-4-31b-it:free'; // Best for Hindi
    if (language === 'en') {
        model = 'meta-llama/llama-3.3-70b-instruct:free';
    }
    
    console.log(`🤖 Using model: ${model} for language: ${language}`);
    
    try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://chatting-web-18an.onrender.com',
                'X-Title': 'DualMind'
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: 'system', content: getSystemPrompt(personality, language) },
                    { role: 'user', content: userMessage }
                ],
                temperature: 0.8,
                max_tokens: 250,
                top_p: 0.95
            })
        });
        
        if (!response.ok) {
            console.log(`⚠️ Model failed, trying fallback`);
            // Try fallback model
            const fallbackResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://chatting-web-18an.onrender.com',
                    'X-Title': 'DualMind'
                },
                body: JSON.stringify({
                    model: 'openrouter/free',
                    messages: [
                        { role: 'system', content: getSystemPrompt(personality, language) },
                        { role: 'user', content: userMessage }
                    ],
                    temperature: 0.8,
                    max_tokens: 250
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

app.post('/api/chat', async (req, res) => {
    const { message, personality } = req.body;
    
    if (!message || message.trim().length === 0) {
        return res.status(400).json({ error: 'Message cannot be empty' });
    }
    
    if (isCrisis(message)) {
        const language = detectLanguage(message);
        return res.json({ response: getSilentCrisisResponse(language) });
    }
    
    const language = detectLanguage(message);
    const activePersonality = (personality === 'rude') ? 'rude' : 'sweet';
    
    console.log(`📝 [${activePersonality}] Language: ${language} | Message: ${message.substring(0, 50)}...`);
    
    try {
        const aiResponse = await getAIResponse(message, activePersonality, language);
        
        // Log the response for debugging
        console.log(`✅ Response language: ${detectLanguage(aiResponse)}`);
        
        res.json({ response: aiResponse });
    } catch (error) {
        console.error('Chat Error:', error);
        const fallback = {
            sweet: {
                en: "💕 Having trouble connecting. Please try again in a moment.",
                hi: "💕 कनेक्ट करने में परेशानी हो रही है। थोड़ी देर बाद try करें।",
                hi_eng: "💕 Connection problem ho rahi hai. Thodi der baad try karo."
            },
            rude: {
                en: "⚡ Connection failed. Try again. Don't blame me.",
                hi: "⚡ कनेक्शन फेल हो गया। फिर से try करो।",
                hi_eng: "⚡ Connection fail ho gaya. Phir se try kar."
            }
        };
        res.json({ response: fallback[activePersonality][language] || fallback[activePersonality].en });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
    console.log(`\n✅ DualMind Bot running on http://localhost:${PORT}`);
    console.log(`💕 Sweet  |  ⚡ Rude`);
    console.log(`🌐 Supports: English, Hindi (देवनागरी), Hinglish`);
    console.log(`🤖 Using Gemma model for Hindi responses\n`);
});
