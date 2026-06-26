import fs from "node:fs/promises";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const maxBodySize = 18 * 1024 * 1024;
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
  res.end(JSON.stringify(payload));
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

    if (req.method === "POST" && (req.url === "/posts" || req.url === "/api/studio/posts")) {
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
