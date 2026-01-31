import express from "express";
import { Store } from "../store.js";
import OpenAI from "openai";

const r = express.Router();

const openrouter = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY,
});

function getTimeContext() {
  const now = new Date();
  const hour = now.getHours();
  const dayName = now.toLocaleDateString("en-US", { weekday: "long" });
  const isWeekend = dayName === "Saturday" || dayName === "Sunday";
  
  let period = "night";
  let periodDescription = "late night hours";
  
  if (hour >= 5 && hour < 12) {
    period = "morning";
    periodDescription = "morning";
  } else if (hour >= 12 && hour < 17) {
    period = "afternoon";
    periodDescription = "afternoon";
  } else if (hour >= 17 && hour < 21) {
    period = "evening";
    periodDescription = "evening";
  }
  
  return {
    hour,
    period,
    periodDescription,
    dayName,
    isWeekend,
    timeString: now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
  };
}

async function getRecentActivity(userId) {
  try {
    const conversations = await Store.listConversations(userId);
    if (!conversations || conversations.length === 0) {
      return { hasHistory: false, recentTopics: [], lastActiveAgo: null };
    }

    const sortedConversations = conversations
      .filter(c => c.updatedAt || c.createdAt)
      .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
      .slice(0, 5);

    if (sortedConversations.length === 0) {
      return { hasHistory: false, recentTopics: [], lastActiveAgo: null };
    }

    const recentTopics = sortedConversations
      .map(c => c.title || c.name)
      .filter(Boolean)
      .slice(0, 3);

    const lastActive = sortedConversations[0]?.updatedAt || sortedConversations[0]?.createdAt;
    let lastActiveAgo = null;
    if (lastActive) {
      const diffMs = Date.now() - new Date(lastActive).getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffHours / 24);
      
      if (diffDays > 0) {
        lastActiveAgo = `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
      } else if (diffHours > 0) {
        lastActiveAgo = `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
      } else {
        lastActiveAgo = "recently";
      }
    }

    return {
      hasHistory: true,
      recentTopics,
      lastActiveAgo,
      conversationCount: conversations.length,
    };
  } catch (error) {
    console.error("[Suggestions] Failed to get recent activity:", error);
    return { hasHistory: false, recentTopics: [], lastActiveAgo: null };
  }
}

r.get("/", async (req, res) => {
  try {
    const userId = req.user?.id;
    const timeContext = getTimeContext();
    const activity = userId ? await getRecentActivity(userId) : { hasHistory: false, recentTopics: [], lastActiveAgo: null };

    const systemPrompt = `You are Zen, a calm and insightful AI assistant. Generate exactly 4 conversation starter suggestions for the user based on the current context.

Current context:
- Time: ${timeContext.timeString} (${timeContext.periodDescription})
- Day: ${timeContext.dayName}${timeContext.isWeekend ? " (weekend)" : ""}
${activity.hasHistory ? `- User has ${activity.conversationCount} previous conversations` : "- This appears to be a new user"}
${activity.recentTopics.length > 0 ? `- Recent conversation topics: ${activity.recentTopics.join(", ")}` : ""}
${activity.lastActiveAgo ? `- Last active: ${activity.lastActiveAgo}` : ""}

Guidelines:
- Make suggestions feel natural and conversational, not robotic
- Tailor to the time of day (morning: planning/energy, afternoon: productivity/focus, evening: reflection/creativity, night: deep thinking/exploration)
- If they have recent topics, you may reference continuing or expanding on one of them
- Keep each suggestion concise (under 10 words)
- Make them actionable - things the user can actually discuss
- Vary the types: mix practical, creative, reflective, and exploratory prompts

Respond with a JSON array of exactly 4 objects, each with a "text" field only (no emojis). Example format:
[{"text": "Plan your morning priorities"}, {"text": "Start a creative project"}, ...]`;

    const userPrompt = activity.hasHistory
      ? `Generate 4 personalized conversation starters for a returning user. Consider their recent activity and the current ${timeContext.period}.`
      : `Generate 4 welcoming conversation starters for someone new. Make them feel invited to explore and chat.`;

    const completion = await openrouter.chat.completions.create({
      model: "meta-llama/llama-3.3-70b-instruct",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.8,
      max_tokens: 500,
    });

    const responseText = completion.choices[0]?.message?.content || "";
    
    let suggestions = [];
    try {
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        suggestions = JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      console.error("[Suggestions] Failed to parse AI response:", parseError);
    }

    if (!Array.isArray(suggestions) || suggestions.length !== 4) {
      suggestions = getDefaultSuggestions(timeContext.period);
    }

    res.json({
      ok: true,
      suggestions,
      context: {
        period: timeContext.period,
        isWeekend: timeContext.isWeekend,
        hasHistory: activity.hasHistory,
      },
    });
  } catch (error) {
    console.error("[Suggestions] Error generating suggestions:", error);
    const timeContext = getTimeContext();
    res.json({
      ok: true,
      suggestions: getDefaultSuggestions(timeContext.period),
      context: { period: timeContext.period, fallback: true },
    });
  }
});

function getDefaultSuggestions(period) {
  const defaults = {
    morning: [
      { text: "What should we focus on today?" },
      { text: "Start a new project idea" },
      { text: "Plan your day with me" },
      { text: "Brainstorm something creative" },
    ],
    afternoon: [
      { text: "What are you working on?" },
      { text: "Debug or optimize something" },
      { text: "Learn something new together" },
      { text: "Focus on a specific goal" },
    ],
    evening: [
      { text: "What's on your mind?" },
      { text: "Create something artistic" },
      { text: "Explore a topic deeply" },
      { text: "Reflect on the day" },
    ],
    night: [
      { text: "What are you thinking about?" },
      { text: "Deep dive into an idea" },
      { text: "Explore something creative" },
      { text: "Let's brainstorm together" },
    ],
  };
  
  return defaults[period] || defaults.afternoon;
}

export default r;
