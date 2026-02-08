# GitHub Pages — Plan wdrozenia (statycznie)

To jest notatka wdrozeniowa, zebysmy pamietali co zmienic, gdy zdecydujesz sie na GH Pages.

## Opcje
1) **Czysty statyczny eksport**
- Prosty hosting na GH Pages.
- API musi dzialac z przegladarki (CORS z `api.raporty.pse.pl`).

2) **GH Pages + proxy**
- Front statyczny na GH Pages.
- Proxy (Vercel/Cloudflare) robi fetch do PSE, zeby ominac CORS.

## Zmiany w projekcie (statyczny eksport)
- `next.config.mjs`:
  - `output: "export"`
  - `basePath: "/pse-dashboard"` (nazwa repo)
  - `assetPrefix: "/pse-dashboard/"`
  - `trailingSlash: true`
  - jesli uzyjemy `next/image`: `images: { unoptimized: true }`
- Usunac / ominac `src/app/api/pse/route.ts` (brak API routes na GH Pages).
- Wszystkie fetch:
  - bezposrednio do `https://api.raporty.pse.pl/...`
  - lub do zewnetrznego proxy (opcjonalnie).

## Deploy (GH Pages)
- `npm run build` + `npm run export` (lub `next build` z `output: "export"`).
- Wrzut `out/` do GitHub Pages.
- Najwygodniej przez GitHub Actions (publikacja `out/`).

## Ryzyka
- CORS moze zablokowac bezposrednie zapytania z przegladarki.
- Brak backendu = brak API routes i brak server-side logiki.
