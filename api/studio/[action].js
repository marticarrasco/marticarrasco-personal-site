import crypto from "node:crypto";

const POSTS_PATH = "public/content/posts.json";
const IMAGE_DIRECTORY = "public/assets/studio";
const SESSION_COOKIE = "studio_session";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_POSTS_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

const imageTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
  ["image/svg+xml", "svg"],
]);

function sendJson(res, status, payload, extraHeaders = {}) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  Object.entries(extraHeaders).forEach(([name, value]) => res.setHeader(name, value));
  res.end(JSON.stringify(payload));
}

function getConfig() {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY || "marticarrasco/marticarrasco-personal-site";
  const branch = process.env.GITHUB_BRANCH || "main";
  const password = process.env.STUDIO_PASSWORD;
  const sessionSecret = process.env.STUDIO_SESSION_SECRET;

  return { token, repository, branch, password, sessionSecret };
}

function assertConfigured() {
  const config = getConfig();
  const missing = [
    ["GITHUB_TOKEN", config.token],
    ["STUDIO_PASSWORD", config.password],
    ["STUDIO_SESSION_SECRET", config.sessionSecret],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`Falten variables de Vercel: ${missing.join(", ")}.`);
  }

  return config;
}

function timingSafeEqualText(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function makeSessionToken(secret) {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `studio:${expiresAt}`;
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function isValidSessionToken(token = "", secret) {
  const [payload, signature] = String(token).split(".");
  const expiresAt = Number(payload?.split(":")[1]);
  if (!payload || !signature || !Number.isSafeInteger(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) {
    return false;
  }

  const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return timingSafeEqualText(signature, expected);
}

function parseCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf("=");
        if (separator < 0) return [part, ""];
        return [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))];
      }),
  );
}

function readJsonBody(req) {
  if (req.body && typeof req.body === "object") {
    return Promise.resolve(req.body);
  }

  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_POSTS_BYTES + MAX_IMAGE_BYTES) {
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

function encodePath(filePath) {
  return filePath.split("/").map(encodeURIComponent).join("/");
}

function githubHeaders(token) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

async function githubRequest(config, filePath, init = {}) {
  const response = await fetch(
    `https://api.github.com/repos/${config.repository}/contents/${encodePath(filePath)}`,
    {
      ...init,
      headers: { ...githubHeaders(config.token), ...(init.headers || {}) },
    },
  );
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const detail = payload.message ? ` (${payload.message})` : "";
    throw new Error(`GitHub ha rebutjat l'operació: ${response.status}${detail}`);
  }

  return payload;
}

async function readGithubFile(config, filePath) {
  const response = await fetch(
    `https://api.github.com/repos/${config.repository}/contents/${encodePath(filePath)}?ref=${encodeURIComponent(config.branch)}`,
    { headers: githubHeaders(config.token) },
  );

  if (response.status === 404) return null;

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload.message ? ` (${payload.message})` : "";
    throw new Error(`No s'ha pogut llegir GitHub: ${response.status}${detail}`);
  }

  if (payload.type !== "file" || !payload.content) {
    throw new Error("La resposta de GitHub no conté un fitxer vàlid.");
  }

  return {
    sha: payload.sha,
    content: Buffer.from(payload.content.replace(/\s/g, ""), "base64").toString("utf8"),
  };
}

async function writeGithubFile(config, filePath, content, message, sha) {
  const body = {
    message,
    content: Buffer.isBuffer(content) ? content.toString("base64") : Buffer.from(content, "utf8").toString("base64"),
    branch: config.branch,
  };
  if (sha) body.sha = sha;

  return githubRequest(config, filePath, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

function slugifyFileName(value) {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

function requireStudioSession(req, res, config) {
  const cookies = parseCookies(req.headers.cookie);
  if (isValidSessionToken(cookies[SESSION_COOKIE], config.sessionSecret)) return true;

  sendJson(res, 401, { error: "Sessió no autoritzada." });
  return false;
}

function getAction(req) {
  const action = Array.isArray(req.query?.action) ? req.query.action[0] : req.query?.action;
  if (action) return action;

  const pathname = new URL(req.url || "/", "http://localhost").pathname;
  return pathname.split("/").filter(Boolean).at(-1) || "";
}

async function handlePosts(req, res, config) {
  if (!requireStudioSession(req, res, config)) return;

  const { posts } = await readJsonBody(req);
  if (!Array.isArray(posts)) {
    sendJson(res, 400, { error: "Format d'articles invàlid." });
    return;
  }

  const serialized = `${JSON.stringify(posts, null, 2)}\n`;
  if (Buffer.byteLength(serialized, "utf8") > MAX_POSTS_BYTES) {
    sendJson(res, 413, { error: "El fitxer d'articles és massa gran." });
    return;
  }

  const current = await readGithubFile(config, POSTS_PATH);
  await writeGithubFile(config, POSTS_PATH, serialized, "studio: update posts", current?.sha);
  sendJson(res, 200, { ok: true, posts });
}

async function handleImage(req, res, config) {
  if (!requireStudioSession(req, res, config)) return;

  const { name = "imatge", type = "", dataUrl = "" } = await readJsonBody(req);
  const match = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/s);
  const mime = (match?.[1] || type).toLowerCase();
  const extension = imageTypes.get(mime);

  if (!match || !extension) {
    sendJson(res, 400, { error: "Format d'imatge no suportat." });
    return;
  }

  const image = Buffer.from(match[2], "base64");
  if (image.length === 0 || image.length > MAX_IMAGE_BYTES) {
    sendJson(res, 413, { error: "La imatge ha de pesar com a màxim 3 MB." });
    return;
  }

  const baseName = slugifyFileName(name) || "imatge";
  const fileName = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${baseName}.${extension}`;
  await writeGithubFile(
    config,
    `${IMAGE_DIRECTORY}/${fileName}`,
    image,
    `studio: upload ${fileName}`,
  );

  sendJson(res, 200, { ok: true, url: `/assets/studio/${fileName}` });
}

export default async function handler(req, res) {
  const action = getAction(req);

  if (req.method === "GET" && action === "health") {
    const config = getConfig();
    const configured = Boolean(config.token && config.password && config.sessionSecret);
    sendJson(res, configured ? 200 : 503, {
      ok: configured,
      storage: "github",
      configured,
    });
    return;
  }

  try {
    const config = assertConfigured();

    if (req.method === "GET" && action === "session") {
      const cookies = parseCookies(req.headers.cookie);
      sendJson(res, 200, {
        authenticated: isValidSessionToken(cookies[SESSION_COOKIE], config.sessionSecret),
      });
      return;
    }

    if (req.method === "POST" && action === "login") {
      const { password = "" } = await readJsonBody(req);
      if (!timingSafeEqualText(String(password), config.password)) {
        sendJson(res, 401, { error: "Contrasenya incorrecta." });
        return;
      }

      const secure = process.env.VERCEL || req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
      sendJson(res, 200, { ok: true }, {
        "Set-Cookie": `${SESSION_COOKIE}=${encodeURIComponent(makeSessionToken(config.sessionSecret))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure}`,
      });
      return;
    }

    if (req.method === "POST" && action === "logout") {
      sendJson(res, 200, { ok: true }, {
        "Set-Cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
      });
      return;
    }

    if (req.method === "POST" && action === "posts") {
      await handlePosts(req, res, config);
      return;
    }

    if (req.method === "POST" && action === "images") {
      await handleImage(req, res, config);
      return;
    }

    sendJson(res, 404, { error: "Endpoint no trobat." });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Error intern del servidor." });
  }
}
