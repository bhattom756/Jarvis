export interface WindowsAgentCommand {
  capability: "applications" | "filesystem" | "input" | "security" | "browser";
  action: string;
  payload: Record<string, unknown>;
}

export function describeWindowsAgent() {
  return {
    id: "windows-agent",
    status: "scaffolded",
    capabilities: ["applications", "filesystem", "input", "security", "browser"],
  };
}

