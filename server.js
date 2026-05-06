const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");
const SERVER_SECRET = process.env.SERVER_SECRET || crypto.randomBytes(32).toString("hex");

const clients = new Map();
const recentMessages = [];
const buckets = new Map();
const MAX_CLIENTS = 500;
const MAX_MESSAGE_LENGTH = 500;
const MAX_BODY_BYTES = 2048;
const MESSAGE_HISTORY = 80;
const IDLE_CLIENT_MS = 1000 * 60 * 8;

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml; charset=utf-8",
  ".ico": "image/x-icon"
};

function hashIdentity(req) {
  const forwarded = req.headers["x-forwarded-for"];
  const rawIp = Array.isArray(forwarded)
    ? forwarded[0]
    : String(forwarded || req.socket.remoteAddress || "unknown").split(",")[0].trim();
  return crypto.createHmac("sha256", SERVER_SECRET).update(rawIp).digest("hex");
}

function applySecurityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
  );
}

function sendJson(res, status, payload) {
  applySecurityHeaders(res);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function tokenBucket(key, limit, refillPerSecond) {
  const now = Date.now();
  const bucket = buckets.get(key) || { tokens: limit, last: now };
  const elapsed = (now - bucket.last) / 1000;
  bucket.tokens = Math.min(limit, bucket.tokens + elapsed * refillPerSecond);
  bucket.last = now;
  if (bucket.tokens < 1) {
    buckets.set(key, bucket);
    return false;
  }
  bucket.tokens -= 1;
  buckets.set(key, bucket);
  return true;
}

function cleanText(value) {
  return String(value || "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_MESSAGE_LENGTH);
}

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const [id, client] of clients) {
    try {
      client.lastSeen = Date.now();
      client.res.write(payload);
    } catch {
      clients.delete(id);
    }
  }
}

function broadcastPresence() {
  broadcast("presence", { count: clients.size });
}

function serveStatic(req, res, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requested));
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
    sendJson(res, 403, { error: "forbidden" });
    return;
  }

  fs.readFile(filePath, (err, data) => {
    applySecurityHeaders(res);
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": contentTypes[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=3600"
    });
    res.end(data);
  });
}

function readJsonBody(req, res, done) {
  let size = 0;
  let raw = "";
  req.on("data", (chunk) => {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      req.destroy();
      return;
    }
    raw += chunk;
  });
  req.on("end", () => {
    try {
      done(JSON.parse(raw || "{}"));
    } catch {
      sendJson(res, 400, { error: "bad_json" });
    }
  });
}

function handleStream(req, res) {
  req.setTimeout(0);
  res.setTimeout(0);
  const identity = hashIdentity(req);
  if (clients.size >= MAX_CLIENTS) {
    sendJson(res, 503, { error: "room_full" });
    return;
  }
  if (!tokenBucket(`stream:${identity}`, 8, 0.05)) {
    sendJson(res, 429, { error: "too_many_connections" });
    return;
  }

  applySecurityHeaders(res);
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });

  const id = crypto.randomUUID();
  clients.set(id, { res, lastSeen: Date.now() });
  res.write(`event: hello\ndata: ${JSON.stringify({ id, history: recentMessages, count: clients.size })}\n\n`);
  broadcastPresence();

  req.on("close", () => {
    clients.delete(id);
    broadcastPresence();
  });
}

function handleMessage(req, res) {
  const identity = hashIdentity(req);
  if (!tokenBucket(`post:${identity}`, 6, 0.25)) {
    sendJson(res, 429, { error: "slow_down" });
    return;
  }

  readJsonBody(req, res, (body) => {
    const text = cleanText(body.message);
    if (text.length < 1) {
      sendJson(res, 400, { error: "empty_message" });
      return;
    }

    const message = {
      id: crypto.randomUUID(),
      alias: `익명-${identity.slice(0, 4)}`,
      text,
      at: Date.now()
    };
    recentMessages.push(message);
    while (recentMessages.length > MESSAGE_HISTORY) recentMessages.shift();
    broadcast("message", message);
    sendJson(res, 201, { ok: true });
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const identity = hashIdentity(req);

  if (!tokenBucket(`req:${identity}`, 120, 2)) {
    sendJson(res, 429, { error: "rate_limited" });
    return;
  }

  if (req.method === "GET" && url.pathname === "/events") {
    handleStream(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/message") {
    handleMessage(req, res);
    return;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    serveStatic(req, res, url.pathname);
    return;
  }

  sendJson(res, 405, { error: "method_not_allowed" });
});

setInterval(() => {
  const now = Date.now();
  for (const [id, client] of clients) {
    if (now - client.lastSeen > IDLE_CLIENT_MS) {
      try {
        client.res.end();
      } catch {}
      clients.delete(id);
    }
  }
  for (const [key, bucket] of buckets) {
    if (now - bucket.last > 1000 * 60 * 20) buckets.delete(key);
  }
  broadcast("ping", { at: now });
  broadcastPresence();
}, 30000).unref();

server.headersTimeout = 8000;
server.requestTimeout = 10000;
server.listen(PORT, () => {
  console.log(`Anonymous chat listening on http://localhost:${PORT}`);
});
