import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function getAIInsights(entries: string[], moods: number[]) {
  const prompt = `
    Based on the following journal entries and mood scores (1-5), provide 3 personalized self-care tips, a motivational quote, and a brief reflection prompt.
    
    Journal Entries:
    ${entries.join("\n---\n")}
    
    Mood Scores:
    ${moods.join(", ")}
    
    Return the response in JSON format with the following structure:
    {
      "tips": ["tip1", "tip2", "tip3"],
      "quote": "quote text",
      "author": "author name",
      "prompt": "reflection prompt text"
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Error getting AI insights:", error);
    return null;
  }
}

const FALLBACK_QUOTES = [
  { quote: "The only way to do great work is to love what you do.", author: "Steve Jobs", tip: "Take a 5-minute walk today." },
  { quote: "Believe you can and you're halfway there.", author: "Theodore Roosevelt", tip: "Drink a glass of water right now." },
  { quote: "Act as if what you do makes a difference. It does.", author: "William James", tip: "Write down one thing you're grateful for." },
  { quote: "The best way to predict the future is to create it.", author: "Peter Drucker", tip: "Plan your top 3 tasks for tomorrow tonight." },
  { quote: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius", tip: "Focus on one task at a time for 25 minutes." }
];

export async function getDailyInspiration() {
  const CACHE_KEY = 'mindful_mirror_daily_quote_v4';
  
  // Use local date string (YYYY-MM-DD) to ensure it changes at midnight local time
  const now = new Date();
  const today = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;

  try {
    // Check cache first
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        const { data, date } = JSON.parse(cached);
        if (date === today && data && data.quote) {
          console.log("Using cached daily inspiration for", today);
          return data;
        }
      } catch (e) {
        console.warn("Failed to parse cached quote", e);
      }
    }

    console.log("Fetching fresh daily inspiration for", today);
    const prompt = "Provide a daily inspirational quote and a short life tip. Return ONLY a JSON object: { \"quote\": \"string\", \"author\": \"string\", \"tip\": \"string\" }";
    
    // Add a timeout to the AI call to prevent hanging
    const aiCall = ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const timeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("AI call timed out")), 10000)
    );

    const response = await Promise.race([aiCall, timeout]) as any;

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
    
    // Fallback to a random quote from our list so the user always sees something
    const fallback = FALLBACK_QUOTES[Math.floor(Math.random() * FALLBACK_QUOTES.length)];
    return fallback;
  }
}
