import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const maxBodySize = 18 * 1024 * 1024;
const studioPassword = process.env.STUDIO_PASSWORD || process.env.VITE_STUDIO_PASSWORD || "marti2026";
const sessionSecret = process.env.STUDIO_SESSION_SECRET || "local-vite-studio-session";
const imageTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
  ["image/svg+xml", "svg"],
]);

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

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

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

function sendJsonWithCookie(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Set-Cookie", `studio_session=${encodeURIComponent(makeSessionToken())}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`);
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function requireStudioSession(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  if (isValidSessionToken(cookies.studio_session)) {
    return true;
  }

  sendJson(res, 401, { error: "Sessio no autoritzada." });
  return false;
}

async function writeJsonFile(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function createStudioApi(root) {
  const publicDir = path.join(root, "public");
  const postsPath = path.join(publicDir, "content", "posts.json");
  const uploadDir = path.join(publicDir, "assets", "studio");

  return async function studioApi(req, res, next) {
    if (req.method === "GET" && (req.url === "/health" || req.url === "/api/studio/health")) {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && (req.url === "/session" || req.url === "/api/studio/session")) {
      const cookies = parseCookies(req.headers.cookie);
      sendJson(res, 200, { authenticated: isValidSessionToken(cookies.studio_session) });
      return;
    }

    if (req.method === "POST" && (req.url === "/login" || req.url === "/api/studio/login")) {
      try {
        const { password = "" } = await readJsonBody(req);
        if (!timingSafeEqualText(String(password), studioPassword)) {
          sendJson(res, 401, { error: "Contrasenya incorrecta." });
          return;
        }

        sendJsonWithCookie(res, 200, { ok: true });
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    if (req.method === "POST" && (req.url === "/logout" || req.url === "/api/studio/logout")) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Set-Cookie", "studio_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method === "POST" && (req.url === "/posts" || req.url === "/api/studio/posts")) {
      if (!requireStudioSession(req, res)) return;

      try {
        const { posts } = await readJsonBody(req);
        if (!Array.isArray(posts)) {
          sendJson(res, 400, { error: "Format d'articles invalid." });
          return;
        }

        await writeJsonFile(postsPath, posts);
        sendJson(res, 200, { ok: true, posts });
      } catch (error) {
        sendJson(res, 500, { error: error.message });
      }
      return;
    }

    if (req.method === "POST" && (req.url === "/images" || req.url === "/api/studio/images")) {
      if (!requireStudioSession(req, res)) return;

      try {
        const { name = "imatge", type = "", dataUrl = "" } = await readJsonBody(req);
        const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        const mime = match?.[1] || type;
        const extension = imageTypes.get(mime);

        if (!match || !extension) {
          sendJson(res, 400, { error: "Format d'imatge no suportat." });
          return;
        }

        const baseName = slugifyFileName(name) || "imatge";
        const fileName = `${Date.now()}-${baseName}.${extension}`;
        const filePath = path.join(uploadDir, fileName);

        await fs.mkdir(uploadDir, { recursive: true });
        await fs.writeFile(filePath, Buffer.from(match[2], "base64"));
        sendJson(res, 200, {
          ok: true,
          url: `/assets/studio/${fileName}`,
        });
      } catch (error) {
        sendJson(res, 500, { error: error.message });
      }
      return;
    }

    next();
  };
}

function studioApiPlugin() {
  return {
    name: "studio-api",
    configureServer(server) {
      server.middlewares.use("/api/studio", createStudioApi(process.cwd()));
    },
  };
}

export default defineConfig({
  cacheDir: "node_modules/.vite-studio",
  plugins: [react(), studioApiPlugin()],
});
