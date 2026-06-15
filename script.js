const personalities = ['sweet', 'rude'];

// Store message history separately for each
const messageHistory = { sweet: [], rude: [] };
const elements = {};

let currentPersonality = 'sweet';

function initElements() {
    personalities.forEach(p => {
        elements[`${p}Messages`] = document.getElementById(`${p}Messages`);
        elements[`${p}Input`] = document.getElementById(`${p}Input`);
        elements[`${p}Typing`] = document.getElementById(`${p}Typing`);
    });
}

function addMessage(personality, text, isUser) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isUser ? 'user' : 'bot'}`;
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = text;
    messageDiv.appendChild(contentDiv);
    
    elements[`${personality}Messages`].appendChild(messageDiv);
    elements[`${personality}Messages`].scrollTop = elements[`${personality}Messages`].scrollHeight;
    
    messageHistory[personality].push({ text, isUser });
}

function showTyping(personality) {
    elements[`${personality}Typing`].style.display = 'flex';
}

function hideTyping(personality) {
    elements[`${personality}Typing`].style.display = 'none';
}

async function sendMessage(personality) {
    const input = elements[`${personality}Input`];
    const userMessage = input.value.trim();
    
    if (!userMessage) return;
    if (userMessage.length > 1000) {
        addMessage(personality, "Message too long (max 1000 characters)", false);
        return;
    }
    
    input.value = '';
    addMessage(personality, userMessage, true);
    
    showTyping(personality);
    const sendBtn = document.querySelector(`.send-btn[data-personality="${personality}"]`);
    if (sendBtn) sendBtn.disabled = true;
    
    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: userMessage, personality: personality })
        });
        
        const data = await response.json();
        hideTyping(personality);
        
        if (data.response) {
            addMessage(personality, data.response, false);
        } else {
            addMessage(personality, "Something went wrong. Try again.", false);
        }
        
    } catch (error) {
        console.error('Error:', error);
        hideTyping(personality);
        addMessage(personality, "🔌 Connection error. Make sure server is running.", false);
    } finally {
        if (sendBtn) sendBtn.disabled = false;
        input.focus();
    }
}

function switchPersonality(personality) {
    currentPersonality = personality;
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`.tab-btn[data-personality="${personality}"]`).classList.add('active');
    
    document.querySelectorAll('.chat-panel').forEach(panel => {
        panel.classList.remove('active-panel');
    });
    document.getElementById(`${personality}Panel`).classList.add('active-panel');
}

function setupEventListeners() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            switchPersonality(btn.dataset.personality);
        });
    });
    
    document.querySelectorAll('.send-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            sendMessage(btn.dataset.personality);
        });
    });
    
    personalities.forEach(p => {
        elements[`${p}Input`].addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage(p);
            }
        });
    });
}

function init() {
    initElements();
    setupEventListeners();
    switchPersonality('sweet');
}

init();