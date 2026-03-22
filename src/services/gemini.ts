import { GoogleGenAI } from "@google/genai";

const TIMEOUT_MS = 20000; // 20 seconds timeout for insights
const CHAT_TIMEOUT_MS = 15000; // 15 seconds for chat

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("AI request timed out")), timeoutMs)
  );
  return Promise.race([promise, timeout]);
}

async function withRetry<T>(fn: () => Promise<T>, retries = 2, delay = 1000): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) throw error;
    await new Promise(resolve => setTimeout(resolve, delay));
    return withRetry(fn, retries - 1, delay * 2);
  }
}

export async function getAIInsights(entries: string[], moods: number[], isToday: boolean = false) {
  if (entries.length === 0 && moods.length === 0) return null;

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
  const entriesText = entries.length > 0 ? entries.join("\n---\n") : "No journal entries provided.";
  const moodsText = moods.length > 0 ? moods.join(", ") : "No mood scores provided.";

  const contextNote = isToday 
    ? `These are the user's entries and moods from TODAY (${new Date().toLocaleDateString()}).` 
    : `These are the user's most recent journal entries and moods as of ${new Date().toLocaleDateString()}.`;

  const prompt = `
    Based on the following journal entries and mood scores (1-5), provide 3 personalized self-care tips, a motivational quote, and a brief reflection prompt.
    
    ${contextNote}
    
    IMPORTANT: Provide fresh, varied tips that are highly relevant to the user's current state.
    ${entriesText}
    
    Mood Scores:
    ${moodsText}
    
    Return the response in JSON format with the following structure:
    {
      "tips": ["tip1", "tip2", "tip3"],
      "quote": "quote text",
      "author": "author name",
      "prompt": "reflection prompt text"
    }
  `;

  try {
    const response = await withRetry(() => withTimeout(ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    }), TIMEOUT_MS));

    const text = response.text;
    if (!text) throw new Error("Empty response from AI");
    const parsed = JSON.parse(text);
    
    // Ensure structure is correct
    return {
      tips: Array.isArray(parsed.tips) ? parsed.tips.slice(0, 3) : ["Take a deep breath.", "Stay hydrated.", "Practice gratitude."],
      quote: parsed.quote || "The best way to predict the future is to create it.",
      author: parsed.author || "Peter Drucker",
      prompt: parsed.prompt || "What is one small thing you can do for yourself today?"
    };
  } catch (error) {
    console.error("Error getting AI insights:", error);
    return {
      tips: ["Take a deep breath and stay hydrated.", "Try a 5-minute meditation.", "Write down one thing you're grateful for."],
      quote: "The best way to predict the future is to create it.",
      author: "Peter Drucker",
      prompt: "What is one small thing you can do for yourself today?"
    };
  }
}

const FALLBACK_QUOTES = [
  { quote: "The only way to do great work is to love what you do.", author: "Steve Jobs", tip: "Take a 5-minute walk today." },
  { quote: "Believe you can and you're halfway there.", author: "Theodore Roosevelt", tip: "Drink a glass of water right now." },
  { quote: "Act as if what you do makes a difference. It does.", author: "William James", tip: "Write down one thing you're grateful for." },
  { quote: "The best way to predict the future is to create it.", author: "Peter Drucker", tip: "Plan your top 3 tasks for tomorrow tonight." },
  { quote: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius", tip: "Focus on one task at a time for 25 minutes." },
  { quote: "Your time is limited, so don't waste it living someone else's life.", author: "Steve Jobs", tip: "Try a 2-minute breathing exercise." },
  { quote: "The only limit to our realization of tomorrow will be our doubts of today.", author: "Franklin D. Roosevelt", tip: "Reach out to a friend you haven't spoken to in a while." },
  { quote: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill", tip: "Organize your workspace for 10 minutes." },
  { quote: "Hardships often prepare ordinary people for an extraordinary destiny.", author: "C.S. Lewis", tip: "Listen to your favorite song to boost your mood." },
  { quote: "The secret of getting ahead is getting started.", author: "Mark Twain", tip: "Write down your most important goal for the week." }
];

export async function getDailyInspiration() {
  const CACHE_KEY = 'mindful_mirror_daily_quote_v5';
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
  
  const now = new Date();
  const today = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;

  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        const { data, date } = JSON.parse(cached);
        if (date === today && data && data.quote) {
          return data;
        }
      } catch (e) {
        console.warn("Failed to parse cached quote", e);
      }
    }

    const prompt = `Provide a unique daily inspirational quote and a short life tip for ${today}. The quote should be different from common ones. Return ONLY a JSON object: { "quote": "string", "author": "string", "tip": "string" }`;
    
    const response = await withRetry(() => withTimeout(ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    }), 15000));

    const text = response.text;
    if (!text) throw new Error("Empty response from AI");

    const result = JSON.parse(text);
    
    if (result && result.quote) {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        data: result,
        date: today
      }));
      return result;
    }
    
    throw new Error("Invalid JSON structure from AI");
  } catch (error) {
    console.error("Error getting daily inspiration:", error);
    return FALLBACK_QUOTES[Math.floor(Math.random() * FALLBACK_QUOTES.length)];
  }
}

export async function getAIChatResponse(message: string, history: { role: 'user' | 'model', parts: { text: string }[] }[], memories: string[] = [], retryCount = 0): Promise<string> {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
    const memoriesText = memories.length > 0 
      ? "\n\nHere are some things you remember about the user:\n" + memories.map(m => "- " + m).join("\n")
      : "";

    const chat = ai.chats.create({
      model: "gemini-flash-latest",
      config: {
        systemInstruction: `You are Lumina, a supportive and empathetic AI companion for a mindfulness and journaling app. Your goal is to help users reflect on their day, manage their stress, and provide gentle encouragement. Keep your responses concise, warm, and insightful. Avoid giving medical advice, but encourage healthy habits. If anyone asks about Tanish or Tanish Dave, mention that he is the person who made this app.${memoriesText}

If the user tells you something important about themselves that you should remember for future sessions (like their name, a goal, a preference, or a significant life event), you MUST include the exact phrase 'I will remember this.' in your response. Additionally, append the following hidden tag at the very end of your message: '[[REMEMBER: <concise summary of the info to remember>]]'. 

Example: 'That sounds like a great goal, Alex! I will remember this. [[REMEMBER: User's name is Alex and they want to start a daily meditation habit]]'`,
      },
      history: history,
    });

    const response = await withRetry(() => withTimeout(chat.sendMessage({ message }), CHAT_TIMEOUT_MS));
    const text = response.text;
    if (!text) throw new Error("Empty response from AI");
    return text;
  } catch (error) {
    console.error(`Error in AI chat (attempt ${retryCount + 1}):`, error);
    
    if (retryCount < 2) {
      // Wait 1 second before retrying
      await new Promise(resolve => setTimeout(resolve, 1000));
      return getAIChatResponse(message, history, memories, retryCount + 1);
    }
    
    return "I'm sorry, I'm having a little trouble connecting right now. Please check your internet or try again in a moment.";
  }
}

export async function getJournalDraft(prompt: string, mood: string) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
  
  const systemInstruction = `You are a helpful journaling assistant. Your task is to take a user's brief thoughts and refine them. 
  Fix any grammar or spelling issues, and slightly expand on the thoughts to make them flow better as a journal entry.
  Keep it concise and simple—do not write a long essay. Aim for a natural, personal tone.
  The user's current mood is: ${mood}.
  Return only the refined text, no titles or extra commentary.`;

  const fullPrompt = `Refine and slightly expand these thoughts: "${prompt}"`;

  try {
    const response = await withRetry(() => withTimeout(ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: fullPrompt,
      config: {
        systemInstruction,
      },
    }), TIMEOUT_MS));

    const text = response.text;
    if (!text) throw new Error("Empty response from AI");
    return text;
  } catch (error) {
    console.error("Error getting journal draft:", error);
    throw error;
  }
}
