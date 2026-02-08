# KSE Live — Dashboard PSE

Lekki dashboard do podglądu danych z API PSE: obciążenie, alerty, ceny energii, rezerwy i prognozy. UI jest nastawione na szybkie skanowanie, a szczegóły są w panelu bocznym.

## Stack
- Next.js 14
- React + TypeScript
- Tailwind CSS
- shadcn/ui

## Szybki start
```bash
npm install
npm run dev
```

## Najważniejsze ścieżki
- `src/app/kse-live/page.tsx` — strona dashboardu
- `src/components/kse-live-dashboard.tsx` — cała logika i UI
- `src/app/api/pse/route.ts` — proxy do API PSE

## Dane i źródła
Dashboard pobiera dane z publicznego API PSE i prezentuje je w formie wykresów, alertów oraz krótkich insightów. W szczegółach widać m.in. prognozę rezerw mocy, ceny energii i statusy regulacji.

## Build
```bash
npm run build
npm start
```

## Notatki
- `.next` i `node_modules` są ignorowane przez git.
- Jeśli chcesz dodać kolejne endpointy, najlepiej zacząć w `src/components/kse-live-dashboard.tsx`.
