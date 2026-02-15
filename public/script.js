/* =============================================================
   AI Chat — Client Script
   Handles: theme, chat sessions, messaging, voice, file upload
   ============================================================= */


// ── DOM References ────────────────────────────────────────────

const sidebar      = document.getElementById("sidebar");
const menuBtn      = document.getElementById("menu-btn");
const overlay      = document.getElementById("overlay");
const themeToggle  = document.getElementById("theme-toggle");
const uploadBtn    = document.getElementById("upload-btn");
const fileInput    = document.getElementById("file-input");
const voiceBtn     = document.getElementById("voice-btn");
const messageInput = document.getElementById("user-input");
const sendBtn      = document.getElementById("send-btn");
const chatBox      = document.getElementById("chat-box");
const welcomePanel = document.getElementById("welcome");
const newChatBtn   = document.getElementById("new-chat");
const historyList  = document.getElementById("history");


// ── App State ─────────────────────────────────────────────────

let conversationHistory = [];         // messages in the current session
let currentController   = null;       // AbortController for the active request
let chatSessions = JSON.parse(localStorage.getItem("chatSessions")) || [];
let currentSessionId    = null;
let pendingImage        = null;       // base64 image waiting to be sent


// ── User Preferences ──────────────────────────────────────────

let userPrefs = JSON.parse(localStorage.getItem("userSettings")) || {
  userName:   "You",
  userAvatar: "👤",
  botName:    "AI Assistant",
  botAvatar:  "🤖",
  autoTheme:  true
};


// ── Animated Background ───────────────────────────────────────
// The background orbs are driven entirely by CSS animations.
// No mouse-tracking or JavaScript gradient updates needed.
// We just make sure the third orb element exists in .bg.

function setupBackground() {
  const bg = document.querySelector(".bg");
  if (!bg) return;

  // Add the third floating orb if it isn't already in the HTML
  if (!bg.querySelector(".orb-c")) {
    const orbC = document.createElement("div");
    orbC.className = "orb-c";
    bg.appendChild(orbC);
  }
}


// ── Theme Management ──────────────────────────────────────────

function applyTheme(isLight) {
  document.body.classList.add("theme-transitioning");
  document.body.classList.toggle("light", isLight);
  themeToggle.checked = isLight;
  localStorage.setItem("theme", isLight ? "light" : "dark");
  setTimeout(() => document.body.classList.remove("theme-transitioning"), 480);
}

function applyAutoTheme() {
  if (!userPrefs.autoTheme) return;
  const hour = new Date().getHours();
  applyTheme(hour >= 6 && hour < 18);  // light during the day
}

// Apply the saved or auto theme on load
if (userPrefs.autoTheme) {
  applyAutoTheme();
  setInterval(applyAutoTheme, 60_000);  // re-check every minute
} else {
  applyTheme(localStorage.getItem("theme") === "light");
}

// Manual toggle — disables auto-theme
themeToggle.addEventListener("change", () => {
  userPrefs.autoTheme = false;
  localStorage.setItem("userSettings", JSON.stringify(userPrefs));
  applyTheme(themeToggle.checked);
});


// ── Keyboard Shortcuts ────────────────────────────────────────

document.addEventListener("keydown", (e) => {
  const ctrl = e.ctrlKey || e.metaKey;

  if (ctrl && e.key === "k") { e.preventDefault(); startNewChat(); messageInput.focus(); }
  if (ctrl && e.key === "/") { e.preventDefault(); messageInput.focus(); }
  if (ctrl && e.key === ",") { e.preventDefault(); openSettingsModal(); }

  if (e.key === "Escape") {
    document.querySelectorAll(".modal-overlay").forEach(m => m.remove());
    closeMobileSidebar();
  }

  // Press ↑ with an empty input to re-use the last user message
  if (e.key === "ArrowUp" && messageInput.value === "") {
    const lastUserMsg = [...conversationHistory].reverse().find(m => m.role === "user");
    if (lastUserMsg) { messageInput.value = lastUserMsg.content; e.preventDefault(); }
  }
});


// ── Mobile Sidebar ────────────────────────────────────────────

function openMobileSidebar()  { sidebar.classList.add("show");    overlay.classList.add("show"); }
function closeMobileSidebar() { sidebar.classList.remove("show"); overlay.classList.remove("show"); }

menuBtn.addEventListener("click", openMobileSidebar);
overlay.addEventListener("click", closeMobileSidebar);


// ── File / Image Upload ───────────────────────────────────────

uploadBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  if (file.type.startsWith("image/")) {
    // Store the image and show a small preview above the input
    const reader = new FileReader();
    reader.onload = (evt) => {
      pendingImage = evt.target.result;
      showImagePreview(file.name, pendingImage);
    };
    reader.readAsDataURL(file);
  } else {
    // For text-based files, paste the content straight into the input
    const reader = new FileReader();
    reader.onload = (evt) => {
      messageInput.value = `I uploaded "${file.name}":\n\n${evt.target.result}`;
    };
    reader.readAsText(file);
  }

  // Reset so the same file can be re-selected later
  fileInput.value = "";
});

function showImagePreview(filename, imageData) {
  // Remove any existing preview first
  document.querySelector(".image-preview")?.remove();

  const preview = document.createElement("div");
  preview.className = "image-preview";
  preview.innerHTML = `
    <div class="preview-content glass">
      <img src="${imageData}" alt="${filename}">
      <div class="preview-info">
        <span>📷 ${filename}</span>
        <button class="remove-preview" title="Remove image">✕</button>
      </div>
    </div>
  `;

  const inputWrap = document.querySelector(".input-wrap");
  inputWrap.insertBefore(preview, inputWrap.firstChild);

  preview.querySelector(".remove-preview").addEventListener("click", () => {
    pendingImage = null;
    preview.remove();
  });
}


// ── Voice Input ───────────────────────────────────────────────

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (SpeechRecognition) {
  const recognition = new SpeechRecognition();
  recognition.lang = "en-US";

  voiceBtn.addEventListener("click", () => {
    recognition.start();
    voiceBtn.style.background = "var(--accent)";
    voiceBtn.title = "Listening…";
  });

  recognition.onresult = (e) => {
    messageInput.value = e.results[0][0].transcript;
    resetVoiceBtn();
  };

  recognition.onerror = resetVoiceBtn;
  recognition.onend   = resetVoiceBtn;

  function resetVoiceBtn() {
    voiceBtn.style.background = "";
    voiceBtn.title = "Voice input";
  }
} else {
  // Hide the voice button if the browser doesn't support it
  voiceBtn.style.display = "none";
}


// ── Markdown Renderer ─────────────────────────────────────────
// A lightweight renderer for the most common markdown patterns.

function renderMarkdown(text) {
  return text
    .replace(/```([\s\S]*?)```/g,  "<pre><code>$1</code></pre>")
    .replace(/`([^`]+)`/g,         "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g,   "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g,       "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\n/g, "<br>");
}


// ── Toast Notifications ───────────────────────────────────────

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);

  // Trigger the slide-in animation on the next frame
  requestAnimationFrame(() => toast.classList.add("show"));

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 320);
  }, 2200);
}


// ── Add a Message Bubble ──────────────────────────────────────

function addMessage(text, type, isHtml = false, imageData = null) {
  // Hide the welcome screen as soon as the first message appears
  welcomePanel.style.display = "none";

  const container = document.createElement("div");
  container.className = `msg-container ${type}`;

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = type === "user" ? userPrefs.userAvatar : userPrefs.botAvatar;

  const wrapper = document.createElement("div");
  wrapper.className = "msg-wrapper";

  const bubble = document.createElement("div");
  bubble.className = `msg ${type}`;

  // Render the bubble content
  if (imageData) {
    const img = document.createElement("img");
    img.src = imageData;
    img.className = "chat-image";
    bubble.appendChild(img);

    if (text) {
      const textNode = document.createElement("div");
      textNode.style.marginTop = "8px";
      textNode.textContent = text;
      bubble.appendChild(textNode);
    }
  } else if (isHtml) {
    bubble.innerHTML = renderMarkdown(text);
  } else {
    bubble.textContent = text;
  }

  // Copy-to-clipboard button that appears on hover
  const actions = document.createElement("div");
  actions.className = "msg-actions";
  actions.innerHTML = `
    <button class="msg-action-btn" title="Copy message">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
      </svg>
    </button>
  `;

  actions.querySelector(".msg-action-btn").addEventListener("click", () => {
    // Strip HTML tags before copying
    const plain = bubble.innerHTML.replace(/<[^>]*>/g, "").replace(/<br>/g, "\n");
    navigator.clipboard.writeText(plain).then(() => showToast("Copied!"));
  });

  wrapper.appendChild(bubble);
  wrapper.appendChild(actions);

  // User messages: wrapper → avatar; bot messages: avatar → wrapper
  if (type === "user") {
    container.appendChild(wrapper);
    container.appendChild(avatar);
  } else {
    container.appendChild(avatar);
    container.appendChild(wrapper);
  }

  chatBox.appendChild(container);
  chatBox.scrollTop = chatBox.scrollHeight;
}


// ── Typing Indicator ──────────────────────────────────────────

function showTypingIndicator() {
  const container = document.createElement("div");
  container.className = "msg-container bot";

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = userPrefs.botAvatar;

  const wrapper = document.createElement("div");
  wrapper.className = "msg-wrapper";

  const bubble = document.createElement("div");
  bubble.className = "msg typing";
  bubble.innerHTML = `
    <span class="dot"></span>
    <span class="dot"></span>
    <span class="dot"></span>
  `;

  wrapper.appendChild(bubble);
  container.appendChild(avatar);
  container.appendChild(wrapper);
  chatBox.appendChild(container);
  chatBox.scrollTop = chatBox.scrollHeight;

  return container;
}


// ── Stop-Generation Button ────────────────────────────────────

function showStopButton() {
  const btn = document.createElement("button");
  btn.id = "stop-btn";
  btn.className = "stop-btn";
  btn.textContent = "⬛ Stop";

  btn.addEventListener("click", () => {
    currentController?.abort();
    currentController = null;
    btn.remove();
  });

  document.querySelector(".input-wrap").prepend(btn);
  return btn;
}


// ── Error Message ─────────────────────────────────────────────

function showErrorMessage(originalText) {
  const container = document.createElement("div");
  container.className = "msg-container bot";

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = userPrefs.botAvatar;

  const wrapper = document.createElement("div");
  wrapper.className = "msg-wrapper";

  const bubble = document.createElement("div");
  bubble.className = "msg error-msg";
  bubble.innerHTML = `
    <span>⚠️ Something went wrong. Please try again.</span>
    <button class="retry-btn">🔄 Retry</button>
  `;

  bubble.querySelector(".retry-btn").addEventListener("click", () => {
    container.remove();
    messageInput.value = originalText;
    sendMessage();
  });

  wrapper.appendChild(bubble);
  container.appendChild(avatar);
  container.appendChild(wrapper);
  chatBox.appendChild(container);
  chatBox.scrollTop = chatBox.scrollHeight;
}


// ── Send a Message ────────────────────────────────────────────

async function sendMessage() {
  const text     = messageInput.value.trim();
  const hasImage = pendingImage !== null;

  if (!text && !hasImage) return;

  // Create a new session automatically if there isn't one
  if (!currentSessionId) {
    startNewChat();
  }

  // Update the session title from the first real message
  if (conversationHistory.length === 0) {
    updateSessionTitle(text || "Image message");
  }

  addMessage(text, "user", false, pendingImage);

  const messageForAPI = hasImage ? `[Image attached] ${text}` : text;

  conversationHistory.push({
    role:    "user",
    content: messageForAPI,
    image:   pendingImage
  });

  // Clear the input and any pending image
  messageInput.value = "";
  if (pendingImage) {
    document.querySelector(".image-preview")?.remove();
    pendingImage = null;
  }

  const typingIndicator = showTypingIndicator();
  const stopButton      = showStopButton();
  currentController     = new AbortController();
  document.body.classList.add("is-loading");

  try {
    const response = await fetch("/chat", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        message: messageForAPI,
        history: conversationHistory.slice(-10)
      }),
      signal: currentController.signal
    });

    if (!response.ok) throw new Error("Network error");

    const data = await response.json();

    typingIndicator.remove();
    stopButton.remove();

    addMessage(data.reply, "bot", true);
    conversationHistory.push({ role: "assistant", content: data.reply });

    saveCurrentSession();

  } catch (err) {
    typingIndicator.remove();
    stopButton?.remove();

    if (err.name === "AbortError") {
      addMessage("Response stopped.", "bot");
    } else {
      showErrorMessage(text);
    }
  } finally {
    currentController = null;
    document.body.classList.remove("is-loading");
  }
}

sendBtn.addEventListener("click", sendMessage);

messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

newChatBtn.addEventListener("click", startNewChat);


// ── Session Management ────────────────────────────────────────

function startNewChat() {
  currentSessionId    = String(Date.now());
  conversationHistory = [];
  chatBox.innerHTML   = "";

  // Show the welcome screen in empty chats
  welcomePanel.style.display = "flex";

  const newSession = {
    id:          currentSessionId,
    title:       "New Chat",
    messages:    [],
    createdAt:   Date.now(),
    lastUpdated: Date.now()
  };

  chatSessions.unshift(newSession);
  localStorage.setItem("chatSessions", JSON.stringify(chatSessions));
  renderHistoryList();
}

function loadSession(sessionId) {
  const session = chatSessions.find(s => s.id === sessionId);
  if (!session) return;

  currentSessionId    = sessionId;
  conversationHistory = session.messages || [];
  chatBox.innerHTML   = "";

  if (conversationHistory.length === 0) {
    // Empty session — show the welcome screen
    welcomePanel.style.display = "flex";
  } else {
    welcomePanel.style.display = "none";
    conversationHistory.forEach(msg => {
      addMessage(msg.content, msg.role === "user" ? "user" : "bot", msg.role === "assistant", msg.image);
    });
  }

  renderHistoryList();
}

function saveCurrentSession() {
  if (!currentSessionId) return;

  const session = chatSessions.find(s => s.id === currentSessionId);
  if (session) {
    session.messages    = conversationHistory;
    session.lastUpdated = Date.now();
    localStorage.setItem("chatSessions", JSON.stringify(chatSessions));
    renderHistoryList();
  }
}

function updateSessionTitle(firstMessage) {
  const session = chatSessions.find(s => s.id === currentSessionId);
  if (session && session.title === "New Chat") {
    session.title = firstMessage.slice(0, 32) + (firstMessage.length > 32 ? "…" : "");
    localStorage.setItem("chatSessions", JSON.stringify(chatSessions));
    renderHistoryList();
  }
}


// ── History Sidebar ───────────────────────────────────────────

function renderHistoryList() {
  historyList.innerHTML = "";

  chatSessions.slice(0, 20).forEach(session => {
    const item = document.createElement("div");
    item.className = "history-item";
    if (session.id === currentSessionId) item.classList.add("active");

    const titleSpan = document.createElement("span");
    titleSpan.className   = "history-title";
    titleSpan.textContent = session.title;

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-chat-btn";
    deleteBtn.innerHTML = "🗑️";
    deleteBtn.title     = "Delete chat";
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      confirmDeleteSession(session.id);
    });

    item.appendChild(titleSpan);
    item.appendChild(deleteBtn);

    item.addEventListener("click", () => {
      loadSession(session.id);
      if (window.innerWidth <= 768) closeMobileSidebar();
    });

    historyList.appendChild(item);
  });
}

function confirmDeleteSession(sessionId) {
  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.innerHTML = `
    <div class="modal-content glass delete-confirm">
      <h3>🗑️ Delete Chat?</h3>
      <p>This cannot be undone.</p>
      <div class="modal-buttons">
        <button class="btn-secondary" id="cancel-del">Cancel</button>
        <button class="btn-danger"    id="confirm-del">Delete</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector("#cancel-del").addEventListener("click", () => modal.remove());
  modal.querySelector("#confirm-del").addEventListener("click", () => {
    chatSessions = chatSessions.filter(s => s.id !== sessionId);
    localStorage.setItem("chatSessions", JSON.stringify(chatSessions));

    if (currentSessionId === sessionId) startNewChat();

    renderHistoryList();
    modal.remove();
    showToast("Chat deleted");
  });

  modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
}


// ── Settings Modal ────────────────────────────────────────────

function openSettingsModal() {
  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.innerHTML = `
    <div class="modal-content glass">
      <h3>⚙️ Customize Chat</h3>

      <div class="settings-group">
        <label>Your Name</label>
        <input type="text" id="s-user-name" value="${userPrefs.userName}" placeholder="Your name">
      </div>
      <div class="settings-group">
        <label>Your Avatar (emoji)</label>
        <input type="text" id="s-user-avatar" value="${userPrefs.userAvatar}" maxlength="2">
      </div>
      <div class="settings-group">
        <label>AI Name</label>
        <input type="text" id="s-bot-name" value="${userPrefs.botName}" placeholder="AI Assistant">
      </div>
      <div class="settings-group">
        <label>AI Avatar (emoji)</label>
        <input type="text" id="s-bot-avatar" value="${userPrefs.botAvatar}" maxlength="2">
      </div>
      <div class="settings-group">
        <label class="checkbox-label">
          <input type="checkbox" id="s-auto-theme" ${userPrefs.autoTheme ? "checked" : ""}>
          Auto-switch theme by time of day
        </label>
      </div>

      <div class="modal-buttons">
        <button class="btn-secondary" id="s-cancel">Cancel</button>
        <button class="btn-primary"   id="s-save">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector("#s-cancel").addEventListener("click", () => modal.remove());

  modal.querySelector("#s-save").addEventListener("click", () => {
    userPrefs.userName   = modal.querySelector("#s-user-name").value.trim()   || "You";
    userPrefs.userAvatar = modal.querySelector("#s-user-avatar").value.trim() || "👤";
    userPrefs.botName    = modal.querySelector("#s-bot-name").value.trim()    || "AI Assistant";
    userPrefs.botAvatar  = modal.querySelector("#s-bot-avatar").value.trim()  || "🤖";
    userPrefs.autoTheme  = modal.querySelector("#s-auto-theme").checked;

    localStorage.setItem("userSettings", JSON.stringify(userPrefs));

    if (userPrefs.autoTheme) applyAutoTheme();
    if (currentSessionId)   loadSession(currentSessionId);

    modal.remove();
    showToast("Settings saved");
  });

  modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
}


// ── Keyboard Shortcuts Modal ──────────────────────────────────

function openShortcutsModal() {
  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.innerHTML = `
    <div class="modal-content glass">
      <h3>⌨️ Keyboard Shortcuts</h3>
      <div class="shortcuts-list">
        <div class="shortcut-item"><span>New Chat</span>        <kbd>Ctrl + K</kbd></div>
        <div class="shortcut-item"><span>Focus Input</span>     <kbd>Ctrl + /</kbd></div>
        <div class="shortcut-item"><span>Settings</span>        <kbd>Ctrl + ,</kbd></div>
        <div class="shortcut-item"><span>Send Message</span>    <kbd>Enter</kbd></div>
        <div class="shortcut-item"><span>Last Message</span>    <kbd>↑</kbd></div>
        <div class="shortcut-item"><span>Close / Dismiss</span> <kbd>Esc</kbd></div>
      </div>
      <button class="btn-primary" id="close-shortcuts">Got it!</button>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector("#close-shortcuts").addEventListener("click", () => modal.remove());
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
}


// ── Welcome Chips ─────────────────────────────────────────────
// Quick-action prompts on the welcome screen

function buildWelcomeScreen() {
  const prompts = [
    "✍️  Help me write something",
    "💡  Explain a concept",
    "🐛  Debug my code",
    "📊  Summarise a document",
  ];

  const chipsContainer = document.createElement("div");
  chipsContainer.className = "welcome-chips";

  prompts.forEach(label => {
    const chip = document.createElement("button");
    chip.className   = "chip";
    chip.textContent = label;
    chip.addEventListener("click", () => {
      messageInput.value = label.replace(/^.{2}\s+/, "");  // strip the emoji prefix
      messageInput.focus();
    });
    chipsContainer.appendChild(chip);
  });

  welcomePanel.appendChild(chipsContainer);
}


// ── Sidebar Buttons (Settings + Help) ────────────────────────

function addSidebarButtons() {
  const settingsBtn = document.createElement("button");
  settingsBtn.className   = "settings-btn";
  settingsBtn.innerHTML   = "⚙️ Settings";
  settingsBtn.addEventListener("click", openSettingsModal);

  const shortcutsBtn = document.createElement("button");
  shortcutsBtn.className  = "settings-btn";
  shortcutsBtn.innerHTML  = "⌨️ Shortcuts";
  shortcutsBtn.addEventListener("click", openShortcutsModal);

  const themeRow = document.querySelector(".theme-row");
  sidebar.insertBefore(settingsBtn,  themeRow);
  sidebar.insertBefore(shortcutsBtn, themeRow);
}


// ── Startup ───────────────────────────────────────────────────

window.addEventListener("load", () => {
  setupBackground();
  buildWelcomeScreen();
  addSidebarButtons();
  renderHistoryList();

  // Load the most recent session, or start fresh
  if (chatSessions.length > 0) {
    loadSession(chatSessions[0].id);
  } else {
    startNewChat();
  }

  if (userPrefs.autoTheme) applyAutoTheme();
});