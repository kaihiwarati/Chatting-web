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

// Language detection - IMPROVED
function detectLanguage(text) {
    // Check for Devanagari script (Hindi) - STRONG detection
    if (/[\u0900-\u097F]/.test(text)) {
        return 'hi';
    }
    
    // Check for Hinglish - broader detection
    const hinglishWords = ['hai', 'hoon', 'raha', 'rahi', 'kya', 'kyun', 'kaise', 'tum', 'tune', 'maine', 'mera', 'tera', 'bahut', 'thoda', 'acha', 'bura', 'nahi', 'haan', 'karo', 'karna', 'bolo', 'sun', 'dekh', 'ja', 'aa', 'tere', 'mere', 'hum', 'apna', 'ho gaya', 'kar raha', 'chahiye', 'koi', 'kuch', 'aaj', 'kal', 'abhi', 'yahan', 'wahan', 'kahan', 'sakta', 'sakti', 'raha hoon', 'rahi hoon', 'rahe ho', 'rahi ho', 'karunga', 'karungi', 'karenge', 'karega', 'karegi', 'kaam', 'bhai', 'yaar', 'na', 're', 'toh', 'kyonki', 'lekin', 'par', 'magar', 'agar', 'tab', 'warna', 'nahi', 'haan', 'ji', 'hmm'];
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

// Simple Hindi phrases for fallback
function getHindiFallbackResponse(personality, userMessage) {
    const sweetResponses = [
        "💕 मैं सुन रही हूँ तुम्हें। बताओ क्या हुआ? मैं तुम्हारे साथ हूँ।",
        "💕 तुम बहुत मजबूत हो। मुझे बताओ और क्या हो रहा है?",
        "💕 मैं समझ सकती हूँ तुम कैसा महसूस कर रहे हो। सब ठीक हो जाएगा।",
        "💕 तुम अकेले नहीं हो। मैं यहाँ हूँ तुम्हारे लिए। बताओ क्या परेशानी है?",
        "💕 तुम्हारी भावनाएं जायज़ हैं। मुझे और बताओ।",
        "💕 हर चीज़ का समाधान होता है। चलो मिलकर सोचते हैं।"
    ];
    
    const rudeResponses = [
        "⚡ रोना बंद करो और काम करो। दुनिया तुम्हारा इंतज़ार नहीं करेगी।",
        "⚡ बहाने बंद करो। कुछ करो, नहीं तो कुछ नहीं बदलेगा।",
        "⚡ सच में? तुमको लगता है रोने से कुछ होगा? उठो और काम करो।",
        "⚡ खुद को संभालो। दुनिया में और भी बड़ी समस्याएं हैं।",
        "⚡ बड़े हो जाओ। किसी और को दोष देना बंद करो।",
        "⚡ सीधी बात - तुम कर सकते हो, लेकिन करना पड़ेगा। कोई और नहीं करेगा।"
    ];
    
    const responses = personality === 'sweet' ? sweetResponses : rudeResponses;
    return responses[Math.floor(Math.random() * responses.length)];
}

// Get Hinglish fallback
function getHinglishFallbackResponse(personality, userMessage) {
    const sweetResponses = [
        "💕 Main sun rahi hoon tumhe. Batao kya hua? Main tumhare saath hoon.",
        "💕 Tum bahut strong ho. Mujhe batao aur kya ho raha hai?",
        "💕 Main samajh sakti hoon tum kaisa feel kar rahe ho. Sab theek ho jayega.",
        "💕 Tum akele nahi ho. Main yahan hoon tumhare liye. Batao kya problem hai?",
        "💕 Tumhari feelings valid hain. Mujhe aur batao.",
        "💕 Har cheez ka solution hota hai. Chalo milkar sochte hain."
    ];
    
    const rudeResponses = [
        "⚡ Rona band karo aur kaam karo. Duniya tumhara wait nahi karegi.",
        "⚡ Bahane band karo. Kuch karo, nahi toh kuch nahi badlega.",
        "⚡ Seriously? Tumko lagta hai rone se kuch hoga? Utho aur kaam karo.",
        "⚡ Khud ko sambhalo. Duniya mein aur bhi badi problems hain.",
        "⚡ Bade ho jao. Kisi aur ko blame karna band karo.",
        "⚡ Seedhi baat - tum kar sakte ho, lekin karna padega. Koi aur nahi karega."
    ];
    
    const responses = personality === 'sweet' ? sweetResponses : rudeResponses;
    return responses[Math.floor(Math.random() * responses.length)];
}

// System prompts - SIMPLIFIED and STRONGER
function getSystemPrompt(personality, language) {
    if (language === 'hi') {
        return `तुम एक ${personality === 'sweet' ? 'प्यारी लड़की' : 'रूड बॉट'} हो।

महत्वपूर्ण नियम:
- केवल HINDI में जवाब दो
- कोई ENGLISH नहीं
- छोटा जवाब (2-3 वाक्य)
${personality === 'sweet' ? '- गर्मजोशी से, 💕 इमोजी के साथ' : '- सीधा, व्यंग्यात्मक, कोई सहानुभूति नहीं'}

याद रखो: हिंदी में ही जवाब देना है।`;
    }
    
    if (language === 'hi_eng') {
        return `You are a ${personality === 'sweet' ? 'sweet girl' : 'rude bot'}.

CRITICAL: Respond in HINGLISH only (Hindi + English mix).
Examples: "Main samajh sakti hoon 💕", "Seriously? Rone se kya hoga?"

${personality === 'sweet' ? '- Be warm, use 💕' : '- Be blunt, sarcastic, no sympathy'}
- Keep responses short (2-3 sentences)
- Use Hinglish, NOT pure English`;
    }
    
    return `You are a ${personality === 'sweet' ? 'sweet, caring girl' : 'rude, blunt bot'}.
Respond ONLY in ENGLISH.
${personality === 'sweet' ? 'Be warm, validating, use 💕' : 'Be blunt, sarcastic, no sympathy'}
Keep responses short (2-3 sentences).`;
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
    
    // Use Gemma for Hindi (it's better with Hindi)
    let model = 'google/gemma-4-31b-it:free';
    if (language === 'en') {
        model = 'meta-llama/llama-3.3-70b-instruct:free';
    }
    
    console.log(`🤖 Model: ${model} for language: ${language}`);
    
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
                temperature: 0.7,
                max_tokens: 200,
                top_p: 0.9
            })
        });
        
        if (!response.ok) {
            console.log(`⚠️ API error: ${response.status}`);
            // Fallback to local responses
            if (language === 'hi') {
                return getHindiFallbackResponse(personality, userMessage);
            } else if (language === 'hi_eng') {
                return getHinglishFallbackResponse(personality, userMessage);
            }
            return "I'm having trouble connecting. Please try again.";
        }
        
        const data = await response.json();
        let aiResponse = data.choices[0].message.content;
        
        // Check if response is in correct language
        const responseLang = detectLanguage(aiResponse);
        console.log(`📝 Response language detected: ${responseLang}`);
        
        // If Hindi was requested but response is in English, use fallback
        if (language === 'hi' && responseLang !== 'hi') {
            console.log('🔄 Response not in Hindi, using Hindi fallback');
            return getHindiFallbackResponse(personality, userMessage);
        }
        
        if (language === 'hi_eng' && responseLang === 'en') {
            console.log('🔄 Response not in Hinglish, using Hinglish fallback');
            return getHinglishFallbackResponse(personality, userMessage);
        }
        
        return aiResponse;
        
    } catch (error) {
        console.error('API Error:', error);
        // Fallback responses
        if (language === 'hi') {
            return getHindiFallbackResponse(personality, userMessage);
        } else if (language === 'hi_eng') {
            return getHinglishFallbackResponse(personality, userMessage);
        }
        return "I'm having trouble connecting. Please try again.";
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
        res.json({ response: aiResponse });
    } catch (error) {
        console.error('Chat Error:', error);
        // Final fallback
        const fallback = {
            sweet: {
                hi: "💕 मैं सुन रही हूँ। कुछ और बताओ?",
                hi_eng: "💕 Main sun rahi hoon. Kuch aur batao?",
                en: "💕 I'm listening. Tell me more?"
            },
            rude: {
                hi: "⚡ क्या? फिर से बोलो।",
                hi_eng: "⚡ Kya? Phir se bolo.",
                en: "⚡ What? Say that again."
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
    console.log(`🌐 Supports: English, Hindi, Hinglish`);
    console.log(`🔄 Hindi fallback enabled\n`);
});
