import React, { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  Download,
  Edit3,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Lock,
  Menu,
  Plus,
  Save,
  Search,
  Upload,
  X,
} from "lucide-react";
import ScrollReveal from "./components/ScrollReveal.jsx";
import { profile } from "./data/profile.js";
import { seedPosts } from "./data/posts.js";
import {
  checkStudioApi,
  checkStudioSession,
  getServerPosts,
  getStoredPosts,
  loginStudio,
  logoutStudio,
  saveServerPosts,
  saveStoredPosts,
  slugify,
  uploadStudioImage,
} from "./lib/storage.js";

const ArticleRenderer = lazy(() => import("./components/ArticleRenderer.jsx"));

function MarkdownPreview({ content }) {
  return (
    <Suspense fallback={<div className="render-loading">Carregant render...</div>}>
      <ArticleRenderer content={content} />
    </Suspense>
  );
}

function useRoute() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = (to) => {
    window.history.pushState({}, "", to);
    setPath(to);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return { path, navigate };
}

function usePosts() {
  const [customPosts, setCustomPosts] = useState(() => getStoredPosts());
  const [serverReady, setServerReady] = useState(false);
  const [syncError, setSyncError] = useState("");

  useEffect(() => {
    let active = true;

    Promise.all([getServerPosts(), checkStudioApi().catch(() => false)])
      .then(([serverPosts, apiReady]) => {
        if (!active) return;
        setCustomPosts(serverPosts);
        saveStoredPosts(serverPosts);
        setServerReady(apiReady);
        setSyncError(apiReady ? "" : "API d'escriptura no disponible. Es mantindra una copia local al navegador.");
      })
      .catch(() => {
        if (!active) return;
        setServerReady(false);
        setSyncError("Servidor no disponible. Es mantindra una copia local al navegador.");
      });

    return () => {
      active = false;
    };
  }, []);

  const posts = useMemo(() => {
    const customIds = new Set(customPosts.map((post) => post.id));
    return [...customPosts, ...seedPosts.filter((post) => !customIds.has(post.id))].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  }, [customPosts]);

  const persist = async (nextPosts) => {
    setCustomPosts(nextPosts);
    saveStoredPosts(nextPosts);

    try {
      await saveServerPosts(nextPosts);
      setServerReady(true);
      setSyncError("");
      return { server: true };
    } catch (error) {
      setServerReady(false);
      setSyncError(error.message);
      return { server: false, error };
    }
  };

  return { posts, customPosts, persist, serverReady, syncError };
}

function useHeroScroll() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let frame = 0;

    const update = () => {
      frame = 0;
      const hero = document.querySelector(".hero");
      if (!hero) {
        setProgress(0);
        return;
      }

      const rect = hero.getBoundingClientRect();
      const nextProgress = Math.min(Math.max(-rect.top / (rect.height * 0.72), 0), 1);
      setProgress(nextProgress);
    };

    const onScroll = () => {
      if (!frame) {
        frame = window.requestAnimationFrame(update);
      }
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return progress.toFixed(3);
}

function LinkButton({ to, href, children, variant = "primary", navigate }) {
  const className = `button ${variant}`;

  if (href) {
    return (
      <a className={className} href={href}>
        {children}
      </a>
    );
  }

  return (
    <button className={className} type="button" onClick={() => navigate(to)}>
      {children}
    </button>
  );
}

function Header({ navigate }) {
  const [open, setOpen] = useState(false);
  const navItems = [
    { label: "Blog", href: "/blog" },
  ];

  const go = (item) => {
    setOpen(false);
    navigate(item.href);
  };

  return (
    <header className="site-header">
      <button className="brand" type="button" onClick={() => navigate("/")}>
        <span className="brand-mark" aria-hidden="true">
          <span className="brand-initial brand-initial-m">M</span>
          <span className="brand-initial brand-initial-c">C</span>
        </span>
        <span>
          <strong>{profile.name}</strong>
          <small>{profile.email}</small>
        </span>
      </button>

      <nav className={open ? "main-nav open" : "main-nav"} aria-label="Principal">
        {navItems.map((item) => (
          <button key={item.label} type="button" onClick={() => go(item)}>
            {item.label}
          </button>
        ))}
      </nav>

      <button
        className="icon-button menu-button"
        type="button"
        aria-label={open ? "Tancar menú" : "Obrir menú"}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>
    </header>
  );
}

function Home({ navigate, posts }) {
  const heroProgress = useHeroScroll();

  return (
    <main>
      <section className="hero" style={{ "--hero-progress": heroProgress }}>
        <div className="hero-media" aria-hidden="true">
          <img src="/assets/hero-foreground.png" alt="" />
        </div>
        <div className="hero-content">
          <p className="eyebrow"></p>
          <h1>{profile.name}</h1>
          <p className="hero-lede">{profile.headline}</p>
          <p className="hero-copy">{profile.intro}</p>
        </div>
      </section>

      <section className="quick-strip" data-reveal>
        <span>{profile.availability}</span>
        <button className="text-link" type="button" onClick={() => navigate("/blog")}>
          Veure tots els articles
        </button>
      </section>

      <section className="section latest-section">
        <div className="section-heading" data-reveal>
          <p className="section-kicker">Blog</p>
          <h2>Últims articles.</h2>
        </div>
        {posts.length > 0 ? (
          <div className="article-grid">
            {posts.slice(0, 3).map((post) => (
              <PostCard key={post.id} post={post} navigate={navigate} />
            ))}
          </div>
        ) : (
          <p className="empty-state" data-reveal>
            Encara no hi ha articles publicats.
          </p>
        )}
      </section>
    </main>
  );
}

function PostCard({ post, navigate }) {
  return (
    <article className="post-card" data-reveal>
      <button type="button" onClick={() => navigate(`/blog/${post.id}`)}>
        <img src={post.cover || "/assets/hero-marti-carrasco.png"} alt="" loading="lazy" />
        <span>{new Date(post.date).toLocaleDateString("ca-ES")}</span>
        <h3>{post.title}</h3>
        <p>{post.summary}</p>
        <small>
          Llegir
          <ExternalLink size={14} />
        </small>
      </button>
    </article>
  );
}

function BlogIndex({ posts, navigate }) {
  const [query, setQuery] = useState("");
  const filtered = posts.filter((post) => {
    const haystack = `${post.title} ${post.summary} ${post.tags.join(" ")}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });

  return (
    <main className="page-shell">
      <section className="page-hero">
        <p className="section-kicker">Blog</p>
        <h1>Articles, apunts i idees.</h1>
        <div className="search-box">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filtrar articles"
            type="search"
          />
        </div>
      </section>

      {filtered.length > 0 ? (
        <section className="article-grid blog-grid">
          {filtered.map((post) => (
            <PostCard key={post.id} post={post} navigate={navigate} />
          ))}
        </section>
      ) : (
        <section className="page-shell narrow empty-state">
          <p>{posts.length === 0 ? "Encara no hi ha articles publicats." : "No hi ha cap article amb aquest filtre."}</p>
        </section>
      )}
    </main>
  );
}

function BlogPost({ post, navigate }) {
  if (!post) {
    return (
      <main className="page-shell narrow">
        <h1>Article no trobat</h1>
        <button className="button primary" type="button" onClick={() => navigate("/blog")}>
          Tornar al blog
        </button>
      </main>
    );
  }

  return (
    <main className="article-page">
      <header className="article-header">
        <button className="text-link" type="button" onClick={() => navigate("/blog")}>
          ← Blog
        </button>
        <p className="section-kicker">{post.tags.join(" · ")}</p>
        <h1>{post.title}</h1>
        <p>{post.summary}</p>
        <time>{new Date(post.date).toLocaleDateString("ca-ES")}</time>
      </header>
      <img className="article-cover" src={post.cover || "/assets/hero-marti-carrasco.png"} alt="" />
      <MarkdownPreview content={post.content} />
    </main>
  );
}

const emptyDraft = {
  title: "",
  summary: "",
  date: new Date().toISOString().slice(0, 10),
  tags: "Personal, Apunts",
  cover: "/assets/hero-marti-carrasco.png",
  content: `# Nou article

Escriu aquí. Pots usar **negreta**, llistes, imatges, tweets i LaTeX:

$$
e^{i\\pi}+1=0
$$

https://twitter.com/OpenAI/status/1731774431678026055`,
};

function Studio({ customPosts, persist, serverReady, syncError }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [password, setPassword] = useState("");
  const [draft, setDraft] = useState(emptyDraft);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [imageAlt, setImageAlt] = useState("");
  const [imageWidth, setImageWidth] = useState(80);
  const [imagePreview, setImagePreview] = useState("");
  const [imageUploading, setImageUploading] = useState(false);

  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex,nofollow";
    document.head.appendChild(meta);
    document.title = "Studio privat | Martí Carrasco";
    return () => {
      meta.remove();
      document.title = "Martí Carrasco | Lloc personal";
    };
  }, []);

  useEffect(() => {
    let active = true;

    checkStudioSession()
      .then((valid) => {
        if (!active) return;
        setAuthenticated(valid);
        setCheckingAuth(false);
      })
      .catch(() => {
        if (!active) return;
        setAuthenticated(false);
        setCheckingAuth(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!imageFile) {
      setImagePreview("");
      return undefined;
    }

    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const login = async (event) => {
    event.preventDefault();
    try {
      await loginStudio(password);
      setAuthenticated(true);
      setPassword("");
      setMessage("");
      return;
    } catch (error) {
      setMessage(error.message);
    }
  };

  const logout = async () => {
    await logoutStudio();
    setAuthenticated(false);
    setMessage("");
  };

  const updateDraft = (field, value) => setDraft((current) => ({ ...current, [field]: value }));

  const save = async () => {
    const id = editingId || slugify(draft.title || `article-${Date.now()}`);
    const post = {
      id,
      title: draft.title || "Article sense títol",
      summary: draft.summary || "Resum pendent.",
      date: draft.date,
      tags: draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      cover: draft.cover,
      content: draft.content,
    };

    const nextPosts = editingId
      ? customPosts.map((item) => (item.id === editingId ? post : item))
      : [post, ...customPosts];

    setSaving(true);
    const result = await persist(nextPosts);
    setSaving(false);
    setEditingId(id);
    setMessage(result.server ? "Article guardat al servidor." : "Article guardat al navegador. El servidor no ha respost.");
  };

  const edit = (post) => {
    setEditingId(post.id);
    setDraft({
      title: post.title,
      summary: post.summary,
      date: post.date,
      tags: post.tags.join(", "),
      cover: post.cover,
      content: post.content,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const remove = async (id) => {
    const result = await persist(customPosts.filter((post) => post.id !== id));
    setMessage(result.server ? "Article esborrat del servidor." : "Article esborrat del navegador. Revisa la sincronitzacio.");
    if (editingId === id) {
      setEditingId(null);
      setDraft(emptyDraft);
    }
  };

  const insert = (snippet) => {
    updateDraft("content", `${draft.content}\n\n${snippet}`);
  };

  const addImage = async ({ useAsCover = false } = {}) => {
    if (!imageFile) return;

    setImageUploading(true);
    try {
      const uploaded = await uploadStudioImage(imageFile);
      const alt = imageAlt.trim() || "Imatge";
      const width = Math.max(20, Math.min(100, Number(imageWidth) || 80));
      const markdown = `![${alt}|w=${width}](${uploaded.url})`;

      if (useAsCover) {
        updateDraft("cover", uploaded.url);
      } else {
        insert(markdown);
      }

      setImageFile(null);
      setImageAlt("");
      setMessage("Imatge guardada al servidor.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setImageUploading(false);
    }
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(customPosts, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "marti-carrasco-posts.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importJson = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!Array.isArray(parsed)) throw new Error("Invalid format");
        const result = await persist(parsed);
        setMessage(result.server ? "Articles importats al servidor." : "Articles importats al navegador. Revisa la sincronitzacio.");
      } catch {
        setMessage("No he pogut importar aquest JSON.");
      }
    };
    reader.readAsText(file);
  };

  if (checkingAuth) {
    return (
      <main className="studio-login">
        <form>
          <Lock size={28} />
          <h1>Studio privat</h1>
          <p>Comprovant sessio...</p>
        </form>
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main className="studio-login">
        <form onSubmit={login}>
          <Lock size={28} />
          <h1>Studio privat</h1>
          <p>Espai reservat per gestionar continguts del web. Si no tens accés autoritzat, torna a la pàgina principal.</p>
          <label>
            Contrasenya
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete="current-password"
            />
          </label>
          <button className="button primary" type="submit">
            Entrar
          </button>
          {message && <p className="form-message">{message}</p>}
        </form>
      </main>
    );
  }

  return (
    <main className="studio">
      <section className="studio-top">
        <div>
          <p className="section-kicker">Studio</p>
          <h1>Editor d'articles</h1>
          <p>
            Markdown, LaTeX, imatges i tweets. En producció, els articles i les
            imatges es desen a GitHub i Vercel publica automàticament els canvis.
            En local es desen a <code> public/content/posts.json</code> i
            <code> public/assets/studio/</code>.
          </p>
          <p className={serverReady ? "sync-status online" : "sync-status offline"}>
            {serverReady ? "Servidor connectat" : syncError || "Servidor pendent"}
          </p>
        </div>
        <div className="studio-actions">
          <button className="button secondary" type="button" onClick={() => { setDraft(emptyDraft); setEditingId(null); }}>
            <Plus size={17} />
            Nou
          </button>
          <button className="button secondary" type="button" onClick={exportJson}>
            <Download size={17} />
            Exportar
          </button>
          <label className="button secondary file-button">
            <Upload size={17} />
            Importar
            <input type="file" accept="application/json" onChange={(event) => importJson(event.target.files?.[0])} />
          </label>
          <button className="button secondary" type="button" onClick={logout}>
            <Lock size={17} />
            Sortir
          </button>
        </div>
      </section>

      <section className="editor-layout">
        <div className="editor-pane">
          <div className="field-grid">
            <label>
              Títol
              <input value={draft.title} onChange={(event) => updateDraft("title", event.target.value)} />
            </label>
            <label>
              Data
              <input value={draft.date} onChange={(event) => updateDraft("date", event.target.value)} type="date" />
            </label>
          </div>
          <label>
            Resum
            <textarea value={draft.summary} onChange={(event) => updateDraft("summary", event.target.value)} rows={3} />
          </label>
          <div className="field-grid">
            <label>
              Tags
              <input value={draft.tags} onChange={(event) => updateDraft("tags", event.target.value)} />
            </label>
            <label>
              Cover
              <input value={draft.cover} onChange={(event) => updateDraft("cover", event.target.value)} />
            </label>
          </div>
          <div className="toolbar">
            <button type="button" onClick={() => insert("**text en negreta**")}>B</button>
            <button type="button" onClick={() => insert("$$\nE=mc^2\n$$")}>LaTeX</button>
            <button type="button" onClick={() => insert("https://twitter.com/OpenAI/status/1731774431678026055")}>Tweet</button>
          </div>
          <div className="image-tool">
            <div className="image-tool-header">
              <ImageIcon size={18} />
              <strong>Imatge</strong>
            </div>
            <label className="image-drop">
              {imagePreview ? (
                <img src={imagePreview} alt="" />
              ) : (
                <span>Selecciona una imatge</span>
              )}
              <input type="file" accept="image/*" onChange={(event) => setImageFile(event.target.files?.[0] || null)} />
            </label>
            <div className="field-grid">
              <label>
                Text alternatiu
                <input value={imageAlt} onChange={(event) => setImageAlt(event.target.value)} placeholder="Descripcio de la imatge" />
              </label>
              <label>
                Amplada: {imageWidth}%
                <input
                  min="20"
                  max="100"
                  step="5"
                  type="range"
                  value={imageWidth}
                  onChange={(event) => setImageWidth(event.target.value)}
                />
              </label>
            </div>
            <div className="studio-actions">
              <button className="button secondary" type="button" onClick={() => addImage()} disabled={!imageFile || imageUploading}>
                <Upload size={17} />
                {imageUploading ? "Pujant..." : "Inserir al text"}
              </button>
              <button className="button secondary" type="button" onClick={() => addImage({ useAsCover: true })} disabled={!imageFile || imageUploading}>
                <ImageIcon size={17} />
                Fer cover
              </button>
            </div>
          </div>
          <label>
            Contingut
            <textarea
              className="content-editor"
              value={draft.content}
              onChange={(event) => updateDraft("content", event.target.value)}
            />
          </label>
          <button className="button primary" type="button" onClick={save} disabled={saving}>
            <Save size={17} />
            {saving ? "Guardant..." : "Guardar article"}
          </button>
          {message && <p className="form-message">{message}</p>}
        </div>

        <div className="preview-pane">
          <p className="section-kicker">Preview</p>
          <h2>{draft.title || "Article sense títol"}</h2>
          <MarkdownPreview content={draft.content} />
        </div>
      </section>

      <section className="stored-posts">
        <h2>Articles guardats</h2>
        {customPosts.length === 0 ? (
          <p>Encara no has guardat cap article propi.</p>
        ) : (
          customPosts.map((post) => (
            <article key={post.id}>
              <div>
                <h3>{post.title}</h3>
                <p>{post.summary}</p>
              </div>
              <button type="button" onClick={() => edit(post)}>
                <Edit3 size={16} />
                Editar
              </button>
              <button type="button" onClick={() => remove(post.id)}>
                <X size={16} />
                Esborrar
              </button>
            </article>
          ))
        )}
      </section>
    </main>
  );
}

function Footer({ navigate }) {
  return (
    <footer className="footer">
      <div>
        <strong>{profile.name}</strong>
        <p>{profile.headline}</p>
      </div>
      <div>
        <a href={`mailto:${profile.email}`}>{profile.email}</a>
        <button type="button" onClick={() => navigate("/studio")}>
          Studio
        </button>
      </div>
    </footer>
  );
}

export default function App() {
  const { path, navigate } = useRoute();
  const { posts, customPosts, persist, serverReady, syncError } = usePosts();
  const blogMatch = path.match(/^\/blog\/([^/]+)$/);
  const post = blogMatch ? posts.find((item) => item.id === blogMatch[1]) : null;

  return (
    <>
      <ScrollReveal />
      <Header navigate={navigate} />
      {path === "/" && <Home navigate={navigate} posts={posts} />}
      {path === "/blog" && <BlogIndex posts={posts} navigate={navigate} />}
      {blogMatch && <BlogPost post={post} navigate={navigate} />}
      {path === "/studio" && (
        <Studio
          customPosts={customPosts}
          persist={persist}
          serverReady={serverReady}
          syncError={syncError}
        />
      )}
      {!["/", "/blog", "/studio"].includes(path) && !blogMatch && (
        <main className="page-shell narrow">
          <FileText size={32} />
          <h1>Pàgina no trobada</h1>
          <button className="button primary" type="button" onClick={() => navigate("/")}>
            Tornar a l'inici
          </button>
        </main>
      )}
      <Footer navigate={navigate} />
    </>
  );
}
