const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const Groq = require("groq-sdk");

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// Rate limiting (simple in-memory)
const rateLimitMap = new Map();
const RATE_LIMIT = 20; // requests per minute
const RATE_WINDOW = 60000; // 1 minute

function checkRateLimit(ip) {
  const now = Date.now();
  const userRequests = rateLimitMap.get(ip) || [];
  
  // Remove old requests outside the window
  const recentRequests = userRequests.filter(time => now - time < RATE_WINDOW);
  
  if (recentRequests.length >= RATE_LIMIT) {
    return false;
  }
  
  recentRequests.push(now);
  rateLimitMap.set(ip, recentRequests);
  return true;
}

app.post("/chat", async (req, res) => {
  try {
    const ip = req.ip || req.connection.remoteAddress;
    
    // Check rate limit
    if (!checkRateLimit(ip)) {
      return res.status(429).json({ 
        reply: "Too many requests. Please wait a moment before trying again." 
      });
    }

    const { message, history } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ reply: "Invalid message format" });
    }

    // Build messages array with context
    let messages = [];
    
    // Add system message for better responses
    messages.push({
      role: "system",
      content: "You are a helpful, friendly AI assistant. Provide clear, accurate, and concise responses. Use markdown formatting when appropriate for code blocks, lists, and emphasis."
    });

    // Add conversation history (if provided)
    if (history && Array.isArray(history)) {
      // Take last 10 messages for context (excluding the current one)
      const contextMessages = history.slice(-11, -1);
      messages.push(...contextMessages);
    }

    // Add current user message
    messages.push({
      role: "user",
      content: message
    });

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: messages,
      temperature: 0.7,
      max_tokens: 2048,
    });

    const reply = completion.choices[0].message.content;

    res.json({ reply });

  } catch (err) {
    console.error("Chat error:", err);
    
    // Handle specific errors
    if (err.status === 401) {
      return res.status(500).json({ 
        reply: "API authentication failed. Please check your API key." 
      });
    }
    
    if (err.status === 429) {
      return res.status(429).json({ 
        reply: "API rate limit exceeded. Please try again in a moment." 
      });
    }

    res.status(500).json({ 
      reply: "I'm having trouble connecting right now. Please try again." 
    });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🔗 http://localhost:${PORT}`);
});
