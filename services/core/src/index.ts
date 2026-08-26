import { createLogger, installProcessErrorHandlers } from "@jarvis/logger";
import { createApp } from "./app.js";

const logger = createLogger("core:process");
installProcessErrorHandlers(logger);

const port = Number(process.env.JARVIS_CORE_PORT ?? process.env.PORT ?? 8000);
const host = process.env.JARVIS_CORE_HOST ?? process.env.HOST ?? "0.0.0.0";
const app = await createApp();

await app.listen({ host, port });
logger.info("JARVIS TypeScript core listening", { host, port });

