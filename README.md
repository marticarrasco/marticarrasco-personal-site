# Martí Carrasco personal site

Web personal per a `marticarrasco.mcdev.es`, construïda amb React i Vite.

## Desenvolupament

```bash
npm install
npm run dev
```

URL local: `http://127.0.0.1:5173`

## Build

```bash
npm run build
```

El resultat queda a `dist/`.

## Studio privat

Ruta: `/studio`

Contrasenya per defecte en desenvolupament: `marti2026`

Per canviar-la:

```bash
STUDIO_PASSWORD=una-contrasenya-forta npm run dev
```

En produccio, defineix tambe `STUDIO_SESSION_SECRET` amb un valor llarg i aleatori.

L'Studio desa els articles i imatges al servidor:

- En desenvolupament amb `npm run dev`: `public/content/posts.json` i `public/assets/studio/`
- En produccio amb `npm start`: `studio-data/content/posts.json` i `studio-data/assets/studio/`

El login de `/studio` es valida al servidor i deixa una sessio HTTP-only. Si l'API no respon, es conserva una copia al navegador amb `localStorage` per no perdre feina.

## Contingut

- Perfil principal: `src/data/profile.js`
- Articles base reutilitzables: `src/data/posts.js` (ara buits; els exemples estan comentats)
- Material antic de CV, portfolio i timeline: `src/data/profileArchive.js`
- Imatges hero generades: `public/assets/hero-marti-carrasco.png` i `public/assets/hero-foreground.png`

## Desplegament

```bash
npm ci
npm run build
STUDIO_PASSWORD=una-contrasenya-forta STUDIO_SESSION_SECRET=un-secret-llarg npm start
```

El servidor Node de `server.js` serveix `dist/`, fa fallback cap a `index.html` per rutes SPA com `/blog/...` o `/studio`, i exposa l'API `/api/studio/*`.

Variables d'entorn:

- `PORT`: port HTTP intern. Per defecte `3000`.
- `HOST`: interfície d'escolta. Per defecte `127.0.0.1`.
- `STUDIO_PASSWORD`: contrasenya del Studio.
- `STUDIO_SESSION_SECRET`: secret per signar la sessio.
- `STUDIO_DATA_DIR`: directori persistent de contingut. Per defecte `studio-data/`.

També hi ha `public/robots.txt`, que desindexa `/studio`.
