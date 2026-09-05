import fs from "node:fs";
import path from "node:path";
import { createLogger, installProcessErrorHandlers } from "@jarvis/logger";
import { createApp } from "./app.js";

const logger = createLogger("core:process");
installProcessErrorHandlers(logger);

// Load root .env file if available
function loadEnv() {
  const envPaths = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../../.env"),
    path.resolve(process.cwd(), "../.env"),
  ];
  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      try {
        const content = fs.readFileSync(envPath, "utf-8");
        for (const line of content.split("\n")) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
            const parts = trimmed.split("=");
            const key = parts[0]?.trim();
            const val = parts.slice(1).join("=").trim().replace(/^["']|["']$/g, "");
            if (key && !process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      } catch {
        // ignore error loading env
      }
    }
  }
}
loadEnv();

const port = Number(process.env.JARVIS_CORE_PORT ?? process.env.PORT ?? 8000);
const host = process.env.JARVIS_CORE_HOST ?? process.env.HOST ?? "0.0.0.0";
const app = await createApp();

await app.listen({ host, port });
logger.info("JARVIS TypeScript core listening", { host, port });

