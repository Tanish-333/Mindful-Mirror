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

export async function getDailyInspiration() {
  const CACHE_KEY = 'mindful_mirror_daily_quote';
  const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

  try {
    // Check cache first
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < CACHE_EXPIRY) {
        console.log("Using cached daily inspiration");
        return data;
      }
    }

    console.log("Fetching fresh daily inspiration from AI...");
    const prompt = "Provide a daily inspirational quote and a short life tip. Return in JSON: { \"quote\": \"...\", \"author\": \"...\", \"tip\": \"...\" }";
    
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const result = JSON.parse(response.text || "{}");
    
    // Cache the result
    if (result.quote) {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        data: result,
        timestamp: Date.now()
      }));
    }

    return result;
  } catch (error) {
    console.error("Error getting daily inspiration:", error);
    // Try to return cached data even if expired as a fallback
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      return JSON.parse(cached).data;
    }
    return null;
  }
}
