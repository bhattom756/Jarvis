import { JarvisError } from "@jarvis/errors";
import type {
  ConfirmationDecision,
  ConversationMessage,
  ConversationSession,
  EmailDraftRequest,
  UserUtterance,
} from "@jarvis/shared-types";

export interface JarvisApiClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

export interface BackendUrls {
  httpUrl: string;
  desktopWsUrl: string;
}

export function buildBackendUrls(baseUrl = "http://127.0.0.1:8000"): BackendUrls {
  const httpUrl = baseUrl.replace(/\/$/, "");
  return {
    httpUrl,
    desktopWsUrl: `${httpUrl.replace(/^http/, "ws")}/ws/desktop`,
  };
}

export class JarvisApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: JarvisApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  health() {
    return this.get<{ ok: boolean; service: string; state: string }>("/health");
  }

  conversations() {
    return this.get<{ active_session_id: string | null; sessions: ConversationSession[] }>("/conversations");
  }

  conversationMessages(conversationId: string) {
    return this.get<{ conversation_id: string; messages: ConversationMessage[] }>(
      `/conversations/${encodeURIComponent(conversationId)}`,
    );
  }

  submitUtterance(utterance: UserUtterance) {
    return this.post<{ accepted: boolean }>("/utterances", utterance);
  }

  sendEmail(draft: EmailDraftRequest) {
    return this.post<{ accepted: boolean; summary: string; confirmation?: unknown }>("/emails/send", draft);
  }

  resolveConfirmation(id: string, decision: ConfirmationDecision) {
    return this.post<{ resolved: boolean; payload?: unknown }>(`/confirmations/${encodeURIComponent(id)}`, decision);
  }

  muteControl(muted: boolean) {
    return this.post<{ ok: boolean }>("/controls/mute", { muted });
  }

  monitoringControl(paused: boolean) {
    return this.post<{ ok: boolean }>("/controls/monitoring", { paused });
  }

  private async get<TResponse>(path: string): Promise<TResponse> {
    return this.request<TResponse>(path, { method: "GET" });
  }

  private async post<TResponse>(path: string, payload: unknown): Promise<TResponse> {
    return this.request<TResponse>(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  private async request<TResponse>(path: string, init: RequestInit): Promise<TResponse> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, init);
    const payload = (await response.json().catch(() => ({}))) as TResponse & { error?: { message?: string } };
    if (!response.ok) {
      throw new JarvisError("HTTP_REQUEST_FAILED", payload.error?.message ?? response.statusText, {
        statusCode: response.status,
        recoverable: response.status >= 500,
      });
    }
    return payload;
  }
}
