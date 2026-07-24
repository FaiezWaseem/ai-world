/**
 * Static game server + secure LLM proxy for AI agents.
 * API key stays on the server (.env) — never sent to the browser.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 5173);

const BASE_URL = (process.env.BASE_URL || "https://api.flash-router.site/v1").replace(
  /\/$/,
  ""
);
const API_KEY = process.env.API_KEY || "";
const MODEL = process.env.MODEL || "gpt-5.4";
const AGENT_COUNT = Number(process.env.AGENT_COUNT || 4);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".map": "application/json"
};

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

/**
 * Extract text from OpenAI Responses API (and chat completions fallback).
 */
function extractOutputText(data) {
  if (!data) {
    return "";
  }
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text;
  }
  if (Array.isArray(data.output)) {
    const parts = [];
    for (const item of data.output) {
      if (item?.type === "message" && Array.isArray(item.content)) {
        for (const c of item.content) {
          if (c?.type === "output_text" && c.text) {
            parts.push(c.text);
          } else if (c?.text) {
            parts.push(c.text);
          }
        }
      } else if (typeof item?.text === "string") {
        parts.push(item.text);
      }
    }
    if (parts.length) {
      return parts.join("\n");
    }
  }
  if (data.choices?.[0]?.message?.content) {
    return data.choices[0].message.content;
  }
  if (typeof data.content === "string") {
    return data.content;
  }
  return "";
}

async function callLlm(prompt) {
  if (!API_KEY) {
    const err = new Error("API_KEY missing in .env");
    err.status = 500;
    throw err;
  }

  const url = `${BASE_URL}/responses`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        input: prompt
      }),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const err = new Error(
      data?.error?.message || data?.message || text || `LLM HTTP ${res.status}`
    );
    err.status = res.status;
    err.payload = data;
    throw err;
  }

  return {
    text: extractOutputText(data),
    raw: data
  };
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath === "/") {
    urlPath = "/index.html";
  }

  const filePath = path.normalize(path.join(__dirname, urlPath));
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, buf) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  // CORS for local tooling
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    res.end();
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/api/health")) {
    sendJson(res, 200, {
      ok: true,
      model: MODEL,
      baseUrl: BASE_URL,
      hasKey: Boolean(API_KEY),
      agentCount: AGENT_COUNT
    });
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/api/config")) {
    sendJson(res, 200, {
      agentCount: AGENT_COUNT,
      model: MODEL
    });
    return;
  }

  if (req.method === "POST" && req.url.startsWith("/api/agent/decide")) {
    try {
      const body = await readBody(req);
      const prompt = body.prompt;
      if (!prompt || typeof prompt !== "string") {
        sendJson(res, 400, { error: "prompt required" });
        return;
      }

      const result = await callLlm(prompt);
      sendJson(res, 200, {
        text: result.text,
        model: MODEL
      });
    } catch (err) {
      console.error("[agent/decide]", err.message);
      sendJson(res, err.status || 500, {
        error: err.message || "LLM request failed"
      });
    }
    return;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    serveStatic(req, res);
    return;
  }

  res.writeHead(405);
  res.end("Method not allowed");
});

server.listen(PORT, () => {
  console.log(`AI World → http://localhost:${PORT}`);
  console.log(`  model=${MODEL}`);
  console.log(`  base=${BASE_URL}`);
  console.log(`  agents=${AGENT_COUNT}`);
  console.log(`  apiKey=${API_KEY ? "set" : "MISSING — set API_KEY in .env"}`);
});
