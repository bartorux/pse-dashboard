# Status zmian (ostatnie UX poprawki)

## Co jest juz wdrozone
- Panel szczegolow dockowany po prawej na duzych ekranach (sticky).
- Auto-scroll do panelu po kliknieciu w „Szczegoly”.
- Mini-nawigacja w panelu (sekcje) + tryb **sticky** podczas scrolla.
- Tryb „lista/menu” po lewej:
  - karty bardziej lekkie (mniej cienia, mniej tla, mniejszy padding),
  - aktywna karta podswietlona,
  - delikatny hover w trybie szczegolow.
- Ukrywanie bloku „Co tu zobaczysz” gdy panel jest otwarty (lg+).
- Split szerokosci: lewa 30% / panel 70% (lg+).
- Portalowe tooltipy skrótow (bez ucinania).

## Pliki kluczowe
- `src/components/kse-live-dashboard.tsx`
- `src/app/globals.css`
- `src/components/ui/card.tsx`
- `src/app/kse-live/page.tsx`

## Dodatkowe notatki
- GH Pages plan w: `GITHUB_PAGES.md`
- README dodany w: `README.md`
