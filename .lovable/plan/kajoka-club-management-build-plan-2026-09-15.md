# KAJOKA Club Management — Build Plan

A complete dark-themed management app for a padel/tennis/beach club, in Italian, reproducing the approved Kinetic Onyx design. All data is stored in the browser (no cloud account needed for V1), pre-filled with realistic demo data so every screen is alive from the first click.

## Look & feel

- Kinetic Onyx dark palette: near-black backgrounds layered into panels, orange `#FF4D00` as the single accent, green/amber/red for states.
- Archivo Narrow for headings (condensed, uppercase), Hanken Grotesk for text, JetBrains Mono for all numbers, prices and codes.
- Fixed sidebar with the KAJOKA mark, the nine sections, and the signed-in operator at the bottom; topbar with search, date/time, notifications and the account menu.

## Screens

1. **Login** — KAJOKA-branded dark sign-in, demo credentials `admin / 1234`, plus a second employee account. Role (Admin / Dipendente) decides what is visible later.
2. **Home — mappa campi** — aerial club view with a status pin per court (3 Padel, 1 Tennis, 3 Beach). Clicking a court opens the session drawer: players, split of the court fee, per-player paid/unpaid state, quick bar extras that immediately reduce stock, and cash/card settlement per player or combined. Free courts can start a new session with the pricing mode (per court or per player).
3. **POS / Bar** — category chips with favourites, product grid with live stock badges (available / low / out), search, cart with quantities, discounts, gift, mixed cash+card payment with change calculation, and the option to charge the order to an active court session.
4. **Prodotti** — master catalogue: search and filters, purchase cost, sale price, live margin, POS visibility toggle, active state, and side drawers to create/edit/delete a product. Cost and margin columns hidden for the employee role.
5. **Magazzino** — physical stock per product with minimum thresholds and OK / sottoscorta / esaurito states; load, unload with a reason, and adjustment actions.
6. **Movimenti** — chronological log of every stock change with filters by day, type and origin; detail panel with before/after stock and a cancel action that writes an automatic inverse movement.
7. **Storico** — every completed sale and payment, filterable, with a detail panel showing the receipt lines and a cancellation flow that reverses the money and optionally restores the stock.
8. **Statistiche** — figures calculated from the real stored data, tabs Panoramica / Bar / Campi / Prodotti / Pagamenti, period selector (oggi, 7, 30 giorni, mese), revenue trend chart, revenue split, top products, court utilisation. Margins and cost figures only for Admin.
9. **Utenti** — staff list with role, state, last access; detail panel with role change, password state, reset, deactivate, and permissions.
10. **Impostazioni** — tabs Generale, Campi, Bar & POS, Magazzino, Sicurezza, Dati & Backup (export/import/reset of the local data), with a warning when leaving with unsaved changes.

## Demo data seeded on first run

7 courts, ~15 bar and pro-shop products with costs/prices/stock, 2 active court sessions with players and extras, a few days of sales in cash, card and mixed, matching stock movements, and 8 staff accounts.

## Technical notes

- TanStack Start routes: `/login`, `/home`, `/pos`, `/prodotti`, `/magazzino`, `/movimenti`, `/storico`, `/statistiche`, `/utenti`, `/impostazioni`; `/` redirects to `/home`. All app routes sit behind a client-side auth guard; `/login` is public.
- A repository layer over `localStorage` (`src/lib/db/*`): typed collections (courts, sessions, products, stock, movements, transactions, users, settings), seeding on first load, and a React store hook so every screen reacts to writes. Swapping to a server backend later means replacing this layer only.
- Every money mutation writes both a transaction and, where stock is involved, a stock movement — so Movimenti, Storico and Statistiche always agree.
- Design tokens (colours, fonts, radii) go into `src/styles.css`; fonts loaded from Google Fonts in the root route.
- The aerial club map is a generated dark aerial render with absolutely-positioned status pins, plus a 2D schematic toggle.

## Scope note

This is a large build; I will work through it in order (foundation and data → shell and login → home/POS → catalogue/stock → logs → stats/users/settings) and everything listed above ships in this project.
