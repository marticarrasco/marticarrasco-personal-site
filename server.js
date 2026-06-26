import crypto from "node:crypto";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = __dirname;
const distDir = path.resolve(rootDir, "dist");
const dataDir = path.resolve(process.env.STUDIO_DATA_DIR || path.join(rootDir, "studio-data"));
const postsPath = path.join(dataDir, "content", "posts.json");
const uploadDir = path.join(dataDir, "assets", "studio");
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";
const studioPassword = process.env.STUDIO_PASSWORD || process.env.VITE_STUDIO_PASSWORD || "marti2026";
const sessionSecret = process.env.STUDIO_SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const maxBodySize = 18 * 1024 * 1024;

const imageTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
  ["image/svg+xml", "svg"],
]);

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"],
  [".txt", "text/plain; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
  [".ttf", "font/ttf"],
]);

function timingSafeEqualText(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function makeSessionToken() {
  const signature = crypto.createHmac("sha256", sessionSecret).update("studio").digest("base64url");
  return `studio.${signature}`;
}

function isValidSessionToken(token = "") {
  return timingSafeEqualText(token, makeSessionToken());
}

function parseCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map((cookie) => cookie.trim().split("="))
      .filter(([key, value]) => key && value)
      .map(([key, value]) => [key, decodeURIComponent(value)]),
  );
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function sendEmpty(res, status, headers = {}) {
  res.writeHead(status, headers);
  res.end();
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > maxBodySize) {
        reject(new Error("Payload massa gran."));
        req.destroy();
      }
    });

    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("JSON invalid."));
      }
    });

    req.on("error", reject);
  });
}

function slugifyFileName(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

async function ensureMutableData() {
  await fs.mkdir(path.dirname(postsPath), { recursive: true });
  await fs.mkdir(uploadDir, { recursive: true });

  try {
    await fs.access(postsPath);
  } catch {
    const bundledPostsPath = path.join(distDir, "content", "posts.json");
    try {
      await fs.copyFile(bundledPostsPath, postsPath);
    } catch {
      await fs.writeFile(postsPath, "[]\n", "utf8");
    }
  }
}

async function writeJsonFile(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function resolveSafeFile(baseDir, requestPath) {
  const decodedPath = decodeURIComponent(requestPath);
  const normalizedPath = path.normalize(decodedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.resolve(baseDir, `.${normalizedPath}`);
  const relativePath = path.relative(path.resolve(baseDir), filePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return null;
  }

  try {
    const stats = await fs.stat(filePath);
    return stats.isFile() ? filePath : null;
  } catch {
    return null;
  }
}

async function serveFile(res, filePath, cacheControl = "public, max-age=3600") {
  const extension = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    "Content-Type": mimeTypes.get(extension) || "application/octet-stream",
    "Cache-Control": cacheControl,
  });
  createReadStream(filePath).pipe(res);
}

function requireStudioSession(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  if (isValidSessionToken(cookies.studio_session)) {
    return true;
  }

  sendJson(res, 401, { error: "Sessio no autoritzada." });
  return false;
}

async function handleStudioApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/studio/health") {
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/studio/session") {
    const cookies = parseCookies(req.headers.cookie);
    sendJson(res, 200, { authenticated: isValidSessionToken(cookies.studio_session) });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/studio/login") {
    try {
      const { password = "" } = await readJsonBody(req);
      if (!timingSafeEqualText(String(password), studioPassword)) {
        sendJson(res, 401, { error: "Contrasenya incorrecta." });
        return true;
      }

      sendJsonWithCookie(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/studio/logout") {
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Set-Cookie": "studio_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify({ ok: true }));
    return true;
  }

  if (url.pathname === "/api/studio/posts" && req.method === "POST") {
    if (!requireStudioSession(req, res)) return true;

    try {
      const { posts } = await readJsonBody(req);
      if (!Array.isArray(posts)) {
        sendJson(res, 400, { error: "Format d'articles invalid." });
        return true;
      }

      await writeJsonFile(postsPath, posts);
      sendJson(res, 200, { ok: true, posts });
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return true;
  }

  if (url.pathname === "/api/studio/images" && req.method === "POST") {
    if (!requireStudioSession(req, res)) return true;

    try {
      const { name = "imatge", type = "", dataUrl = "" } = await readJsonBody(req);
      const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      const mime = match?.[1] || type;
      const extension = imageTypes.get(mime);

      if (!match || !extension) {
        sendJson(res, 400, { error: "Format d'imatge no suportat." });
        return true;
      }

      const baseName = slugifyFileName(name) || "imatge";
      const fileName = `${Date.now()}-${baseName}.${extension}`;
      const filePath = path.join(uploadDir, fileName);

      await fs.mkdir(uploadDir, { recursive: true });
      await fs.writeFile(filePath, Buffer.from(match[2], "base64"));
      sendJson(res, 200, { ok: true, url: `/assets/studio/${fileName}` });
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return true;
  }

  if (url.pathname.startsWith("/api/studio/")) {
    sendJson(res, 404, { error: "Endpoint no trobat." });
    return true;
  }

  return false;
}

function sendJsonWithCookie(res, status, payload) {
  const secureCookie = process.env.COOKIE_SECURE === "true" ? "; Secure" : "";
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Set-Cookie": `studio_session=${encodeURIComponent(makeSessionToken())}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secureCookie}`,
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

async function handleStatic(req, res, url) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    sendEmpty(res, 405, { Allow: "GET, HEAD" });
    return;
  }

  if (url.pathname === "/content/posts.json") {
    await serveFile(res, postsPath, "no-store");
    return;
  }

  if (url.pathname.startsWith("/assets/studio/")) {
    const uploadPath = await resolveSafeFile(dataDir, url.pathname);
    if (uploadPath) {
      await serveFile(res, uploadPath, "public, max-age=31536000, immutable");
      return;
    }
  }

  const staticPath = await resolveSafeFile(distDir, url.pathname === "/" ? "/index.html" : url.pathname);
  if (staticPath) {
    const immutable = url.pathname.startsWith("/assets/");
    await serveFile(res, staticPath, immutable ? "public, max-age=31536000, immutable" : "public, max-age=3600");
    return;
  }

  await serveFile(res, path.join(distDir, "index.html"), "no-store");
}

await ensureMutableData();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (await handleStudioApi(req, res, url)) {
      return;
    }

    await handleStatic(req, res, url);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Error intern del servidor." });
  }
});

server.listen(port, host, () => {
  console.log(`Marti Carrasco site listening on http://${host}:${port}`);
  console.log(`Studio data directory: ${dataDir}`);
});
