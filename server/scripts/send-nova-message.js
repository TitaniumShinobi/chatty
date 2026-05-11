#!/usr/bin/env node
/**
 * Send one message to Nova via POST /api/vvault/message.
 * Uses the same env as the server (loadEnv) so the JWT validates.
 * Run from repo root after backend is running: node server/scripts/send-nova-message.js
 */

import "../loadEnv.js";
import jwt from "jsonwebtoken";
import fetch from "node-fetch";

const JWT_SECRET = process.env.JWT_SECRET;
const API_PORT = process.env.API_PORT ? parseInt(process.env.API_PORT, 10) : 5050;
const API_BASE_URL = process.env.API_BASE_URL || `http://127.0.0.1:${API_PORT}`;
const COOKIE_NAME = process.env.COOKIE_NAME || "sid";
const TEST_USER_ID = process.env.TEST_USER_ID || "dev-agent";
const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL || "";
const TEST_MESSAGE = process.argv.slice(2).join(" ").trim() || "Nova, can you hear me?";
const TEST_CONSTRUCT_ID = process.env.TEST_CONSTRUCT_ID || "nova-001";

if (!JWT_SECRET) {
  console.error("JWT_SECRET is not set. Use the same .env the server was started with (e.g. server/.env or root .env).");
  process.exit(1);
}

const payload = { sub: TEST_USER_ID };
if (TEST_USER_EMAIL) payload.email = TEST_USER_EMAIL;

const token = jwt.sign(payload, JWT_SECRET);
const url = `${API_BASE_URL}/api/vvault/message`;
const body = {
  constructId: TEST_CONSTRUCT_ID,
  message: TEST_MESSAGE,
};

(async () => {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `${COOKIE_NAME}=${token}`,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    console.log("Status:", res.status, res.statusText);
    console.log("Body:", typeof data === "object" ? JSON.stringify(data, null, 2) : data);
    if (!res.ok) {
      process.exit(1);
    }
  } catch (err) {
    console.error("Request failed:", err.message);
    process.exit(1);
  }
})();
