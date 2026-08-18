import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
dotenv.config({ path: path.join(root, ".env") });

process.env.AGENT_SKILL = "translate";
process.env.PORT = process.env.TRANSLATOR_PORT || "4002";

await import("../specialist-summarizer/server.js");
