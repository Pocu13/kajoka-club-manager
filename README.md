# KAJOKA Club Hub

Build the complete KAJOKA Club Management web application reproducing the approved Google Stitch design and DESIGN.md from the attached zip (Kinetic Onyx theme, Archivo Narrow, Hanken Grotesk, JetBrains Mono, #FF4D00 orange, dark surface hierarchy). Implement local persistent repository architecture (localStorage, no Supabase for V1) with seed demo data (3 Padel, 1 Tennis, 3 Beach courts, Bar products, cash/card/mixed payments in EUR). Include login (admin/1234, Admin and Dipendente roles), AppShell with persistent sidebar and topbar, routes (/login, /home, /pos, /prodotti, /magazzino, /movimenti, /storico, /statistiche, /utenti, /impostazioni), operational court map with sessions, pricing modes, player splits, player extras (immediate stock decrement), full Bar POS with cart, search, categories, stock states, favorites, mixed payment calculation, master Products catalog CRUD with drawers, physical Warehouse stock management (load, unload with causes, adjustment), Movements log with cancel/inverse movements, Storico economic transactions with sale cancellations and stock restoration options, dynamic real-data calculated Statistics with tabs (Panoramica, Bar, Campi, Prodotti, Pagamenti) and role guards for margins/costs, Staff Users management with password states and permissions, and multi-tab Settings (Generale, Campi, Bar & POS, Magazzino, Sicurezza, Dati & Backup) with unsaved changes guards.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://kajoka-club-manager.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/cc3d9c8e-c21c-49a6-ab3d-e3bea8d52f94).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
