const POSTS_KEY = "marticarrasco.posts";
const SERVER_POSTS_URL = "/content/posts.json";
const HEALTH_API_URL = "/api/studio/health";
const SESSION_API_URL = "/api/studio/session";
const LOGIN_API_URL = "/api/studio/login";
const LOGOUT_API_URL = "/api/studio/logout";
const POSTS_API_URL = "/api/studio/posts";
const IMAGES_API_URL = "/api/studio/images";

export function getStoredPosts() {
  try {
    return JSON.parse(localStorage.getItem(POSTS_KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveStoredPosts(posts) {
  localStorage.setItem(POSTS_KEY, JSON.stringify(posts));
}

export async function getServerPosts() {
  const response = await fetch(`${SERVER_POSTS_URL}?v=${Date.now()}`, {
    cache: "no-store",
  });

  if (response.status === 404) {
    return [];
  }

  if (!response.ok) {
    throw new Error("No s'han pogut carregar els articles del servidor.");
  }

  const posts = await response.json();
  return Array.isArray(posts) ? posts : [];
}

export async function checkStudioApi() {
  const response = await fetch(HEALTH_API_URL, { cache: "no-store" });
  return response.ok;
}

export async function checkStudioSession() {
  const response = await fetch(SESSION_API_URL, {
    cache: "no-store",
    credentials: "same-origin",
  });

  if (!response.ok) {
    return false;
  }

  const session = await response.json();
  return Boolean(session.authenticated);
}

export async function loginStudio(password) {
  const response = await fetch(LOGIN_API_URL, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "No s'ha pogut iniciar sessio.");
  }

  return response.json();
}

export async function logoutStudio() {
  await fetch(LOGOUT_API_URL, {
    method: "POST",
    credentials: "same-origin",
  });
}

export async function saveServerPosts(posts) {
  const response = await fetch(POSTS_API_URL, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ posts }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "No s'han pogut guardar els articles al servidor.");
  }

  return response.json();
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No s'ha pogut llegir la imatge."));
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

export async function uploadStudioImage(file) {
  const dataUrl = await readFileAsDataUrl(file);
  const response = await fetch(IMAGES_API_URL, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: file.name,
      type: file.type,
      dataUrl,
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "No s'ha pogut pujar la imatge al servidor.");
  }

  return response.json();
}

export function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
