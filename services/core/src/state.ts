import type {
  AssistantState,
  ConversationMessage,
  ConversationSession,
  EventEnvelope,
  SystemStatus,
  UserUtterance,
} from "@jarvis/shared-types";

export interface CoreState {
  assistantState: AssistantState;
  activeConversationId: string;
  sessions: ConversationSession[];
  messages: Record<string, ConversationMessage[]>;
  systemStatus: SystemStatus;
  ingestUtterance: (utterance: UserUtterance) => EventEnvelope[];
}

function now() {
  return new Date().toISOString();
}

export function createCoreState(): CoreState {
  const timestamp = now();
  const conversationId = crypto.randomUUID();
  const sessions: ConversationSession[] = [
    {
      id: conversationId,
      title: "New conversation",
      preview: "TypeScript core migration shell is online.",
      created_at: timestamp,
      updated_at: timestamp,
      message_count: 1,
    },
  ];
  const messages: Record<string, ConversationMessage[]> = {
    [conversationId]: [
      {
        id: crypto.randomUUID(),
        conversation_id: conversationId,
        role: "system",
        content: "TypeScript core migration shell is online.",
        source: "core",
        created_at: timestamp,
      },
    ],
  };

  return {
    assistantState: "IDLE",
    activeConversationId: conversationId,
    sessions,
    messages,
    systemStatus: {
      microphone: "not_connected",
      memory_db: "pending_migration",
      conversation_store: "in_memory",
      vector_memory: "pending_migration",
      llm_provider: "pending_migration",
      tts_provider: "pending_migration",
      browser: "disabled",
      monitoring: "paused",
      connectors: {
        windows_notifications: "pending_migration",
        email_inbox: "pending_migration",
        email_sending: "pending_migration",
      },
    },
    ingestUtterance(utterance) {
      const createdAt = now();
      const userMessage: ConversationMessage = {
        id: crypto.randomUUID(),
        conversation_id: conversationId,
        role: "user",
        content: utterance.text,
        source: utterance.source ?? "manual",
        created_at: createdAt,
      };
      messages[conversationId] = [...(messages[conversationId] ?? []), userMessage];
      const currentSession = sessions[0];
      if (currentSession) {
        sessions[0] = {
          ...currentSession,
          preview: utterance.text,
          updated_at: createdAt,
          message_count: (messages[conversationId] ?? []).length,
        };
      }

      return [
        {
          type: "conversation.message",
          timestamp: createdAt,
          payload: userMessage,
        },
        {
          type: "assistant.state",
          timestamp: createdAt,
          payload: {
            state: "THINKING",
            goal: utterance.text,
            task: "Core TypeScript migration shell received the request",
            confidence: 0.5,
          },
        },
      ];
    },
  };
}

