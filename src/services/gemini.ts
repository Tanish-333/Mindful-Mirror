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
  const prompt = "Provide a daily inspirational quote and a short life tip. Return in JSON: { \"quote\": \"...\", \"author\": \"...\", \"tip\": \"...\" }";
  
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
    console.error("Error getting daily inspiration:", error);
    return null;
  }
}
