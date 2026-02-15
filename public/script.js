const sidebar = document.getElementById("sidebar");
const menuBtn = document.getElementById("menu-btn");
const overlay = document.getElementById("overlay");
const toggle = document.getElementById("theme-toggle");
const uploadBtn = document.getElementById("upload-btn");
const fileInput = document.getElementById("file-input");
const voiceBtn = document.getElementById("voice-btn");
const input = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const chatBox = document.getElementById("chat-box");
const welcome = document.getElementById("welcome");
const newChatBtn = document.getElementById("new-chat");
const historyDiv = document.getElementById("history");

let conversationHistory = [];
let currentController = null;
let chatSessions = JSON.parse(localStorage.getItem('chatSessions')) || [];
let currentSessionId = null;
let uploadedImage = null;

let userSettings = JSON.parse(localStorage.getItem('userSettings')) || {
  userName: 'You',
  userAvatar: '👤',
  botName: 'AI Assistant',
  botAvatar: '🤖',
  autoTheme: true
};

let mouseX = 0;
let mouseY = 0;
let targetX = 0;
let targetY = 0;

document.addEventListener('mousemove', (e) => {
  targetX = e.clientX;
  targetY = e.clientY;
});

function updateDynamicGradient() {
  mouseX += (targetX - mouseX) * 0.05;
  mouseY += (targetY - mouseY) * 0.05;

  const x = (mouseX / window.innerWidth) * 100;
  const y = (mouseY / window.innerHeight) * 100;
  const bg = document.querySelector('.bg');

  if (bg) {
    const isLight = document.body.classList.contains('light');
    if (isLight) {
      // Subtle pastel gradients for light mode
      bg.style.background = `
        radial-gradient(circle at ${x}% ${y}%, rgba(139,92,246,0.10), transparent 45%),
        radial-gradient(circle at ${100 - x}% ${100 - y}%, rgba(59,130,246,0.10), transparent 45%),
        var(--bg)
      `;
    } else {
      // Rich gradients for dark mode
      bg.style.background = `
        radial-gradient(circle at ${x}% ${y}%, rgba(139,92,246,0.27), transparent 35%),
        radial-gradient(circle at ${100 - x}% ${100 - y}%, rgba(59,130,246,0.27), transparent 35%),
        var(--bg)
      `;
    }
  }

  requestAnimationFrame(updateDynamicGradient);
}

requestAnimationFrame(updateDynamicGradient);

function showAvatarSettings() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content glass">
      <h3>⚙️ Customize Your Chat</h3>
      <div class="settings-group">
        <label>Your Name:</label>
        <input type="text" id="user-name-input" value="${userSettings.userName}" placeholder="Your name">
      </div>
      <div class="settings-group">
        <label>Your Avatar (emoji):</label>
        <input type="text" id="user-avatar-input" value="${userSettings.userAvatar}" placeholder="👤" maxlength="2">
      </div>
      <div class="settings-group">
        <label>AI Name:</label>
        <input type="text" id="bot-name-input" value="${userSettings.botName}" placeholder="AI Assistant">
      </div>
      <div class="settings-group">
        <label>AI Avatar (emoji):</label>
        <input type="text" id="bot-avatar-input" value="${userSettings.botAvatar}" placeholder="🤖" maxlength="2">
      </div>
      <div class="settings-group">
        <label class="checkbox-label">
          <input type="checkbox" id="auto-theme-toggle" ${userSettings.autoTheme ? 'checked' : ''}>
          Auto switch theme based on time
        </label>
      </div>
      <div class="modal-buttons">
        <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        <button class="btn-primary" id="save-settings">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  document.getElementById('save-settings').onclick = () => {
    userSettings.userName = document.getElementById('user-name-input').value || 'You';
    userSettings.userAvatar = document.getElementById('user-avatar-input').value || '👤';
    userSettings.botName = document.getElementById('bot-name-input').value || 'AI Assistant';
    userSettings.botAvatar = document.getElementById('bot-avatar-input').value || '🤖';
    userSettings.autoTheme = document.getElementById('auto-theme-toggle').checked;
    localStorage.setItem('userSettings', JSON.stringify(userSettings));
    modal.remove();
    if (currentSessionId) loadConversation(currentSessionId);
    if (userSettings.autoTheme) applyAutoTheme();
  };
  modal.onclick = (e) => {
    if (e.target === modal) modal.remove();
  };
}

function applyAutoTheme() {
  if (!userSettings.autoTheme) return;
  const hour = new Date().getHours();
  const shouldBeLight = hour >= 6 && hour < 18;
  document.body.classList.toggle('light', shouldBeLight);
  toggle.checked = shouldBeLight;
  document.body.classList.add('theme-transitioning');
  setTimeout(() => document.body.classList.remove('theme-transitioning'), 500);
}

if (userSettings.autoTheme) {
  applyAutoTheme();
  setInterval(applyAutoTheme, 60000);
} else if (localStorage.getItem('theme') === 'light') {
  toggle.checked = true;
  document.body.classList.add('light');
}

toggle.addEventListener("change", () => {
  userSettings.autoTheme = false;
  localStorage.setItem('userSettings', JSON.stringify(userSettings));
  document.body.classList.add('theme-transitioning');
  if (toggle.checked) {
    document.body.classList.add("light");
    localStorage.setItem('theme', 'light');
  } else {
    document.body.classList.remove("light");
    localStorage.setItem('theme', 'dark');
  }
  setTimeout(() => document.body.classList.remove('theme-transitioning'), 500);
});

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    createNewChat();
    input.focus();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === '/') {
    e.preventDefault();
    input.focus();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === ',') {
    e.preventDefault();
    showAvatarSettings();
  }
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay').forEach(m => m.remove());
    sidebar.classList.remove("show");
    overlay.classList.remove("show");
  }
  if (e.key === 'ArrowUp' && input.value === '' && conversationHistory.length > 0) {
    const lastUserMsg = [...conversationHistory].reverse().find(m => m.role === 'user');
    if (lastUserMsg) {
      input.value = lastUserMsg.content;
      e.preventDefault();
    }
  }
});

function showKeyboardShortcuts() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content glass">
      <h3>⌨️ Keyboard Shortcuts</h3>
      <div class="shortcuts-list">
        <div class="shortcut-item">
          <kbd>Ctrl</kbd> + <kbd>K</kbd>
          <span>New Chat</span>
        </div>
        <div class="shortcut-item">
          <kbd>Ctrl</kbd> + <kbd>/</kbd>
          <span>Focus Input</span>
        </div>
        <div class="shortcut-item">
          <kbd>Ctrl</kbd> + <kbd>,</kbd>
          <span>Settings</span>
        </div>
        <div class="shortcut-item">
          <kbd>Enter</kbd>
          <span>Send Message</span>
        </div>
        <div class="shortcut-item">
          <kbd>↑</kbd>
          <span>Edit Last Message</span>
        </div>
        <div class="shortcut-item">
          <kbd>Esc</kbd>
          <span>Close Modal/Sidebar</span>
        </div>
      </div>
      <button class="btn-primary" onclick="this.closest('.modal-overlay').remove()">Got it!</button>
    </div>
  `;
  document.body.appendChild(modal);
  modal.onclick = (e) => {
    if (e.target === modal) modal.remove();
  };
}

menuBtn.onclick = () => {
  sidebar.classList.add("show");
  overlay.classList.add("show");
};

overlay.onclick = () => {
  sidebar.classList.remove("show");
  overlay.classList.remove("show");
};

uploadBtn.onclick = () => fileInput.click();

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  if (file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = (event) => {
      uploadedImage = event.target.result;
      showImagePreview(file.name, uploadedImage);
    };
    reader.readAsDataURL(file);
  } else {
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target.result;
      input.value = `I uploaded a file named "${file.name}". Here's the content:\n\n${content}`;
    };
    reader.readAsText(file);
  }
});

function showImagePreview(filename, imageData) {
  const preview = document.createElement('div');
  preview.className = 'image-preview';
  preview.innerHTML = `
    <div class="preview-content glass">
      <img src="${imageData}" alt="${filename}">
      <div class="preview-info">
        <span>📷 ${filename}</span>
        <button class="remove-preview">✕</button>
      </div>
    </div>
  `;
  
  const inputWrap = document.querySelector('.input-wrap');
  inputWrap.insertBefore(preview, inputWrap.firstChild);
  
  preview.querySelector('.remove-preview').onclick = () => {
    uploadedImage = null;
    preview.remove();
  };
}

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (SpeechRecognition) {
  const rec = new SpeechRecognition();
  rec.lang = "en-US";
  voiceBtn.onclick = () => {
    rec.start();
    voiceBtn.style.background = "var(--accent)";
  };
  rec.onresult = (e) => {
    input.value = e.results[0][0].transcript;
    voiceBtn.style.background = "rgba(255,255,255,0.08)";
  };
  rec.onerror = () => {
    voiceBtn.style.background = "rgba(255,255,255,0.08)";
  };
  rec.onend = () => {
    voiceBtn.style.background = "rgba(255,255,255,0.08)";
  };
}

function parseMarkdown(text) {
  text = text.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
  text = text.replace(/\n/g, '<br>');
  return text;
}

function copyMessageText(text) {
  const cleanText = text.replace(/<[^>]*>/g, '').replace(/<br>/g, '\n');
  navigator.clipboard.writeText(cleanText).then(() => {
    showToast('Message copied!');
  });
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

function addMessage(text, type, isHtml = false, imageData = null) {
  welcome.style.display = "none";
  const msgContainer = document.createElement("div");
  msgContainer.className = `msg-container ${type}`;
  
  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.innerText = type === "user" ? userSettings.userAvatar : userSettings.botAvatar;
  
  const msgWrapper = document.createElement("div");
  msgWrapper.className = "msg-wrapper";
  
  const msg = document.createElement("div");
  msg.className = `msg ${type}`;
  
  if (imageData) {
    const img = document.createElement('img');
    img.src = imageData;
    img.className = 'chat-image';
    msg.appendChild(img);
    if (text) {
      const textDiv = document.createElement('div');
      textDiv.style.marginTop = '8px';
      textDiv.innerText = text;
      msg.appendChild(textDiv);
    }
  } else if (isHtml) {
    msg.innerHTML = parseMarkdown(text);
  } else {
    msg.innerText = text;
  }
  
  const actions = document.createElement("div");
  actions.className = "msg-actions";
  actions.innerHTML = `
    <button class="msg-action-btn" title="Copy message">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
    </button>
  `;
  
  actions.querySelector('.msg-action-btn').onclick = () => {
    copyMessageText(msg.innerHTML);
  };
  
  msgWrapper.appendChild(msg);
  msgWrapper.appendChild(actions);
  
  if (type === "user") {
    msgContainer.appendChild(msgWrapper);
    msgContainer.appendChild(avatar);
  } else {
    msgContainer.appendChild(avatar);
    msgContainer.appendChild(msgWrapper);
  }
  
  chatBox.appendChild(msgContainer);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function typingBubble() {
  const msgContainer = document.createElement("div");
  msgContainer.className = "msg-container bot";
  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.innerText = userSettings.botAvatar;
  const msgWrapper = document.createElement("div");
  msgWrapper.className = "msg-wrapper";
  const t = document.createElement("div");
  t.className = "msg typing";
  t.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
  msgWrapper.appendChild(t);
  msgContainer.appendChild(avatar);
  msgContainer.appendChild(msgWrapper);
  chatBox.appendChild(msgContainer);
  chatBox.scrollTop = chatBox.scrollHeight;
  return msgContainer;
}

function addStopButton() {
  const stopBtn = document.createElement("button");
  stopBtn.id = "stop-btn";
  stopBtn.className = "stop-btn";
  stopBtn.innerHTML = "⬛ Stop";
  stopBtn.onclick = () => {
    if (currentController) {
      currentController.abort();
      currentController = null;
      stopBtn.remove();
    }
  };
  const inputWrap = document.querySelector('.input-wrap');
  inputWrap.insertBefore(stopBtn, inputWrap.firstChild);
  return stopBtn;
}

function showError(originalMessage) {
  const msgContainer = document.createElement("div");
  msgContainer.className = "msg-container bot";
  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.innerText = userSettings.botAvatar;
  const msgWrapper = document.createElement("div");
  msgWrapper.className = "msg-wrapper";
  const errorDiv = document.createElement("div");
  errorDiv.className = "msg error-msg";
  errorDiv.innerHTML = `
    <span>⚠️ Sorry, something went wrong. Please try again.</span>
    <button class="retry-btn">🔄 Retry</button>
  `;
  msgWrapper.appendChild(errorDiv);
  msgContainer.appendChild(avatar);
  msgContainer.appendChild(msgWrapper);
  chatBox.appendChild(msgContainer);
  chatBox.scrollTop = chatBox.scrollHeight;
  errorDiv.querySelector('.retry-btn').onclick = () => {
    msgContainer.remove();
    input.value = originalMessage;
    sendMessage();
  };
}

function deleteChat(sessionId) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content glass delete-confirm">
      <h3>🗑️ Delete Chat?</h3>
      <p>This action cannot be undone.</p>
      <div class="modal-buttons">
        <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        <button class="btn-danger" id="confirm-delete">Delete</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  document.getElementById('confirm-delete').onclick = () => {
    chatSessions = chatSessions.filter(s => s.id !== sessionId);
    localStorage.setItem('chatSessions', JSON.stringify(chatSessions));
    if (currentSessionId === sessionId) {
      createNewChat();
    }
    renderHistory();
    modal.remove();
    showToast('Chat deleted');
  };
  modal.onclick = (e) => {
    if (e.target === modal) modal.remove();
  };
}

function saveConversation() {
  if (!currentSessionId) return;
  const session = chatSessions.find(s => s.id === currentSessionId);
  if (session) {
    session.messages = conversationHistory;
    session.lastUpdated = Date.now();
    localStorage.setItem('chatSessions', JSON.stringify(chatSessions));
    renderHistory();
  }
}

function loadConversation(sessionId) {
  const session = chatSessions.find(s => s.id === sessionId);
  if (!session) return;
  currentSessionId = sessionId;
  conversationHistory = session.messages || [];
  chatBox.innerHTML = '';

  if (conversationHistory.length === 0) {
    // Empty session — show the welcome screen
    welcome.style.display = "block";
  } else {
    welcome.style.display = "none";
    conversationHistory.forEach(msg => {
      addMessage(msg.content, msg.role === 'user' ? 'user' : 'bot', msg.role === 'assistant', msg.image);
    });
  }
}

function createNewChat() {
  currentSessionId = Date.now().toString();
  conversationHistory = [];
  chatBox.innerHTML = '';
  welcome.style.display = "block";
  const newSession = {
    id: currentSessionId,
    title: 'New Chat',
    messages: [],
    createdAt: Date.now(),
    lastUpdated: Date.now()
  };
  chatSessions.unshift(newSession);
  localStorage.setItem('chatSessions', JSON.stringify(chatSessions));
  renderHistory();
}

function renderHistory() {
  historyDiv.innerHTML = '';
  chatSessions.slice(0, 20).forEach(session => {
    const div = document.createElement('div');
    div.className = 'history-item';
    
    const titleSpan = document.createElement('span');
    titleSpan.className = 'history-title';
    titleSpan.innerText = session.title;
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-chat-btn';
    deleteBtn.innerHTML = '🗑️';
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      deleteChat(session.id);
    };
    
    div.appendChild(titleSpan);
    div.appendChild(deleteBtn);
    
    div.onclick = () => {
      loadConversation(session.id);
      if (window.innerWidth <= 768) {
        sidebar.classList.remove("show");
        overlay.classList.remove("show");
      }
    };
    
    if (session.id === currentSessionId) {
      div.classList.add('active');
    }
    
    historyDiv.appendChild(div);
  });
}

function updateChatTitle(firstMessage) {
  const session = chatSessions.find(s => s.id === currentSessionId);
  if (session && session.title === 'New Chat') {
    session.title = firstMessage.slice(0, 30) + (firstMessage.length > 30 ? '...' : '');
    localStorage.setItem('chatSessions', JSON.stringify(chatSessions));
    renderHistory();
  }
}

async function sendMessage() {
  const text = input.value.trim();
  const hasImage = uploadedImage !== null;
  
  if (!text && !hasImage) return;
  
  if (!currentSessionId) {
    createNewChat();
    updateChatTitle(text || 'Image message');
  } else if (conversationHistory.length === 0) {
    updateChatTitle(text || 'Image message');
  }
  
  addMessage(text, "user", false, uploadedImage);
  
  const messageContent = hasImage ? `[Image uploaded] ${text}` : text;
  
  conversationHistory.push({
    role: "user",
    content: messageContent,
    image: uploadedImage
  });
  
  input.value = "";
  
  if (uploadedImage) {
    document.querySelector('.image-preview')?.remove();
    uploadedImage = null;
  }
  
  const typing = typingBubble();
  const stopBtn = addStopButton();
  currentController = new AbortController();
  document.body.classList.add('is-loading');
  
  try {
    const res = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        message: messageContent,
        history: conversationHistory.slice(-10)
      }),
      signal: currentController.signal
    });
    
    if (!res.ok) throw new Error('Network response was not ok');
    const data = await res.json();
    typing.remove();
    stopBtn.remove();
    addMessage(data.reply, "bot", true);
    conversationHistory.push({
      role: "assistant",
      content: data.reply
    });
    saveConversation();
  } catch (err) {
    typing.remove();
    if (stopBtn) stopBtn.remove();
    if (err.name === 'AbortError') {
      addMessage("Response cancelled", "bot");
    } else {
      showError(text);
    }
  } finally {
    currentController = null;
    document.body.classList.remove('is-loading');
  }
}

sendBtn.onclick = sendMessage;

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

newChatBtn.onclick = createNewChat;

function addSettingsButton() {
  const settingsBtn = document.createElement('button');
  settingsBtn.className = 'settings-btn';
  settingsBtn.innerHTML = '⚙️ Settings';
  settingsBtn.onclick = showAvatarSettings;
  const helpBtn = document.createElement('button');
  helpBtn.className = 'settings-btn';
  helpBtn.innerHTML = '⌨️ Shortcuts';
  helpBtn.onclick = showKeyboardShortcuts;
  const themeRow = document.querySelector('.theme-row');
  sidebar.insertBefore(settingsBtn, themeRow);
  sidebar.insertBefore(helpBtn, themeRow);
}

window.addEventListener('load', () => {
  renderHistory();
  addSettingsButton();
  if (chatSessions.length > 0) {
    loadConversation(chatSessions[0].id);
  }
  if (userSettings.autoTheme) {
    applyAutoTheme();
  }
});