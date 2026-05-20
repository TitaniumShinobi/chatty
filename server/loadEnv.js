/**
 * Load .env before any route/module reads process.env.
 * Must be imported FIRST in server.js (before vvault etc).
 * Loads root .env then server/.env (server overrides root for same keys).
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });
dotenv.config({ path: path.resolve(__dirname, ".env") });
