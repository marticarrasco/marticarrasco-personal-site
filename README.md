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
VITE_STUDIO_PASSWORD=una-contrasenya-forta npm run build
```

L'Studio desa els articles al servidor local quan s'executa amb `npm run dev`:

- Articles: `public/content/posts.json`
- Imatges pujades: `public/assets/studio/`

Si l'API local no respon, es conserva una copia al navegador amb `localStorage` per no perdre feina. El control de contrasenya continua sent una proteccio de client; per exposar l'Studio a internet caldria autenticacio real al servidor.

## Contingut

- Perfil principal: `src/data/profile.js`
- Articles base reutilitzables: `src/data/posts.js` (ara buits; els exemples estan comentats)
- Material antic de CV, portfolio i timeline: `src/data/profileArchive.js`
- Imatges hero generades: `public/assets/hero-marti-carrasco.png` i `public/assets/hero-foreground.png`

## Desplegament

Puja el contingut de `dist/` al hosting del domini. La web és una SPA, així que cal fallback cap a `index.html` per rutes com `/blog/...` o `/studio`. S'inclouen:

- `public/_redirects` per Netlify-like hosting.
- `public/.htaccess` per Apache.

També hi ha `public/robots.txt`, que desindexa `/studio`.
