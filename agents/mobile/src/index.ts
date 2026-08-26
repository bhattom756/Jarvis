export interface MobileAgentCommand {
  capability: "accessibility" | "notifications" | "applications" | "device" | "security";
  action: string;
  payload: Record<string, unknown>;
}

export function describeMobileAgent() {
  return {
    id: "mobile-agent",
    status: "scaffolded",
    capabilities: ["accessibility", "notifications", "applications", "device", "security"],
  };
}
