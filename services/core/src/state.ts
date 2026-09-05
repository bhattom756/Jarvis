import { createLogger } from "@jarvis/logger";
import type {
  AssistantState,
  ConversationMessage,
  ConversationSession,
  EventEnvelope,
  SystemStatus,
  UserUtterance,
} from "@jarvis/shared-types";

const logger = createLogger("core:state");

export interface CoreState {
  assistantState: AssistantState;
  activeConversationId: string;
  sessions: ConversationSession[];
  messages: Record<string, ConversationMessage[]>;
  systemStatus: SystemStatus;
  getInitialGreetingEvents: () => EventEnvelope[];
  ingestUtterance: (utterance: UserUtterance, emit?: (event: EventEnvelope) => void) => Promise<EventEnvelope[]>;
}

function now() {
  return new Date().toISOString();
}

export function getTimeOfDayGreeting(): string {
  const hour = new Date().getHours();
  let timeOfDay = "morning";
  if (hour >= 12 && hour < 17) {
    timeOfDay = "afternoon";
  } else if (hour >= 17 && hour < 22) {
    timeOfDay = "evening";
  } else if (hour >= 22 || hour < 5) {
    timeOfDay = "night";
  }
  return `Good ${timeOfDay}, boss. How can I help you today?`;
}

async function fetchKnowledgeResponse(query: string): Promise<string | null> {
  const cleaned = query.trim().replace(/[?]/g, "");

  // Strategy 1: Wikipedia Search API for exact page match
  try {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleaned)}&format=json&origin=*`;
    const searchRes = await fetch(searchUrl);
    if (searchRes.ok) {
      const searchData = (await searchRes.json()) as { query?: { search?: Array<{ title: string; snippet: string }> } };
      const topTitle = searchData.query?.search?.[0]?.title;
      if (topTitle) {
        const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topTitle)}`;
        const sumRes = await fetch(summaryUrl);
        if (sumRes.ok) {
          const sumData = (await sumRes.json()) as { extract?: string };
          if (sumData.extract && sumData.extract.length > 10) {
            const sentences = sumData.extract.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ");
            return sentences;
          }
        }
      }
    }
  } catch (error) {
    logger.error("Wikipedia search failed", error);
  }

  // Strategy 2: DuckDuckGo Instant Answer
  try {
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(cleaned)}&format=json&no_html=1&skip_disambig=1`;
    const ddgRes = await fetch(ddgUrl);
    if (ddgRes.ok) {
      const ddgData = (await ddgRes.json()) as { AbstractText?: string; Answer?: string; Definition?: string };
      const ans = ddgData.AbstractText || ddgData.Answer || ddgData.Definition;
      if (ans && ans.length > 10) {
        return ans;
      }
    }
  } catch (error) {
    logger.error("DuckDuckGo lookup failed", error);
  }

  return null;
}

async function generateOpenAiResponse(prompt: string, history: ConversationMessage[] = []): Promise<string | null> {
  const apiKey = process.env.JARVIS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey || !apiKey.trim().startsWith("sk-")) {
    logger.warn("OpenAI API key missing or invalid format");
    return null;
  }

  let modelName = process.env.JARVIS_OPENAI_MODEL || "gpt-4o-mini";
  if (modelName.includes("gpt-5") || modelName.includes("terra")) {
    modelName = "gpt-4o-mini";
  }

  const systemPrompt = `You are FRIDAY (Female Replacement Intelligent Digital Assistant Youth), Tony Stark's personal AI assistant.
You are witty, highly intelligent, articulate, loyal, concise, and direct.
Always address the user as "boss".
Keep your answers brief, informative, conversational, and under 3 sentences so they sound natural when spoken aloud.
Do NOT use markdown formatting like bold asterisks (**), bullet points, or code blocks.`;

  const recent = history.slice(-8).map((m) => ({
    role: m.role === "user" ? "user" : "assistant",
    content: m.content,
  }));

  const messagesPayload = [
    { role: "system", content: systemPrompt },
    ...recent,
    { role: "user", content: prompt },
  ];

  try {
    logger.info(`🤖 Calling OpenAI ChatGPT (${modelName}) for: "${prompt}"`);
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: modelName,
        messages: messagesPayload,
        temperature: 0.7,
        max_tokens: 200,
      }),
    });

    if (res.ok) {
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const text = data.choices?.[0]?.message?.content?.trim();
      if (text) {
        logger.info(`✨ OpenAI Response: "${text}"`);
        return text;
      }
    } else {
      const errText = await res.text();
      logger.error(`OpenAI API HTTP ${res.status}: ${errText}`);
      if (modelName !== "gpt-3.5-turbo") {
        const fallbackRes = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey.trim()}`,
          },
          body: JSON.stringify({
            model: "gpt-3.5-turbo",
            messages: messagesPayload,
            temperature: 0.7,
            max_tokens: 200,
          }),
        });
        if (fallbackRes.ok) {
          const fallbackData = (await fallbackRes.json()) as { choices?: Array<{ message?: { content?: string } }> };
          const text = fallbackData.choices?.[0]?.message?.content?.trim();
          if (text) return text;
        }
      }
    }
  } catch (err) {
    logger.error("OpenAI request failed", err);
  }

  return null;
}

async function generateAssistantResponse(prompt: string, history: ConversationMessage[] = []): Promise<string> {
  const text = prompt.toLowerCase().trim();

  // 1. Prioritize OpenAI ChatGPT for full intelligence
  const aiResult = await generateOpenAiResponse(prompt, history);
  if (aiResult) {
    return aiResult;
  }

  // 2. Local system time/date queries
  if (text.includes("time") || text.includes("clock")) {
    const timeStr = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return `The current time is ${timeStr}, boss.`;
  }
  if (text.includes("date") || text.includes("day is it")) {
    const dateStr = new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    return `Today is ${dateStr}, boss.`;
  }

  // 3. Fallback to knowledge search
  const knowledge = await fetchKnowledgeResponse(prompt);
  if (knowledge) {
    return `${knowledge} boss.`;
  }

  return `I have processed your request for "${prompt}", boss. Standing by for your next command.`;
}

export function createCoreState(): CoreState {
  const timestamp = now();
  const conversationId = crypto.randomUUID();
  const greetingText = getTimeOfDayGreeting();
  const greetingMessage: ConversationMessage = {
    id: crypto.randomUUID(),
    conversation_id: conversationId,
    role: "assistant",
    content: greetingText,
    source: "friday",
    created_at: timestamp,
  };

  const sessions: ConversationSession[] = [
    {
      id: conversationId,
      title: "Active Session",
      preview: greetingText,
      created_at: timestamp,
      updated_at: timestamp,
      message_count: 2,
    },
  ];
  const messages: Record<string, ConversationMessage[]> = {
    [conversationId]: [
      {
        id: crypto.randomUUID(),
        conversation_id: conversationId,
        role: "system",
        content: "FRIDAY Core Service online.",
        source: "core",
        created_at: timestamp,
      },
      greetingMessage,
    ],
  };

  logger.info(`👋 [STARTUP GREETING]: "${greetingText}"`);

  return {
    assistantState: "IDLE",
    activeConversationId: conversationId,
    sessions,
    messages,
    systemStatus: {
      microphone: "active",
      memory_db: "in_memory",
      conversation_store: "in_memory",
      vector_memory: "active",
      llm_provider: "active",
      tts_provider: "active",
      browser: "enabled",
      monitoring: "active",
      connectors: {
        windows_notifications: "active",
        email_inbox: "active",
        email_sending: "active",
      },
    },
    getInitialGreetingEvents() {
      const createdAt = now();
      const speechId = crypto.randomUUID();

      return [
        {
          type: "conversation.message",
          timestamp: createdAt,
          payload: greetingMessage,
        },
        {
          type: "speech.output",
          timestamp: createdAt,
          payload: {
            id: speechId,
            text: greetingText,
            voice: "friday",
            status: "ready",
            is_initial_greeting: true,
          },
        },
        {
          type: "assistant.state",
          timestamp: createdAt,
          payload: {
            state: "SPEAKING",
            goal: "Initial Greeting",
            task: greetingText,
            confidence: 1.0,
          },
        },
      ];
    },
    async ingestUtterance(utterance, emit) {
      const createdAt = now();
      logger.info(`🎙️ [SYSTEM MIC ACTIVE] Listening...`);
      logger.info(`🗣️ [USER SAID]: "${utterance.text}"`);
      logger.info(`🧠 [PROCESSING]: Analyzing user request...`);

      const userMessage: ConversationMessage = {
        id: crypto.randomUUID(),
        conversation_id: conversationId,
        role: "user",
        content: utterance.text,
        source: utterance.source ?? "manual",
        created_at: createdAt,
      };

      messages[conversationId] = [...(messages[conversationId] ?? []), userMessage];

      const userEvent: EventEnvelope = {
        type: "conversation.message",
        timestamp: createdAt,
        payload: userMessage,
      };
      const thinkingEvent: EventEnvelope = {
        type: "assistant.state",
        timestamp: createdAt,
        payload: {
          state: "THINKING",
          goal: utterance.text,
          task: "Processing query...",
          confidence: 1.0,
        },
      };

      if (emit) {
        emit(userEvent);
        emit(thinkingEvent);
      }

      const responseText = await generateAssistantResponse(utterance.text, messages[conversationId] ?? []);
      const speechId = crypto.randomUUID();
      const responseTime = now();

      logger.info(`🔊 [FRIDAY RESPONDED]: "${responseText}"`);

      const assistantMessage: ConversationMessage = {
        id: crypto.randomUUID(),
        conversation_id: conversationId,
        role: "assistant",
        content: responseText,
        source: "friday",
        created_at: responseTime,
      };

      messages[conversationId] = [...(messages[conversationId] ?? []), assistantMessage];

      const currentSession = sessions[0];
      if (currentSession) {
        sessions[0] = {
          ...currentSession,
          preview: responseText,
          updated_at: responseTime,
          message_count: (messages[conversationId] ?? []).length,
        };
      }

      const assistantEvent: EventEnvelope = {
        type: "conversation.message",
        timestamp: responseTime,
        payload: assistantMessage,
      };
      const speechEvent: EventEnvelope = {
        type: "speech.output",
        timestamp: responseTime,
        payload: {
          id: speechId,
          text: responseText,
          voice: "friday",
          status: "ready",
        },
      };
      const stateEvent: EventEnvelope = {
        type: "assistant.state",
        timestamp: responseTime,
        payload: {
          state: "SPEAKING",
          goal: utterance.text,
          task: responseText,
          confidence: 0.95,
        },
      };

      if (emit) {
        emit(assistantEvent);
        emit(speechEvent);
        emit(stateEvent);
      }

      return [userEvent, thinkingEvent, assistantEvent, speechEvent, stateEvent];
    },
  };
}
