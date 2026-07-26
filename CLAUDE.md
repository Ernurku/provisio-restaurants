# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Provisio** — a restaurant back-office SPA for managing ingredients, recipes, menu cost, suppliers, and purchasing. UI language is Russian. No build pipeline: open `admin.html` directly in a browser or deploy the folder as static files.

## Running / testing

No build step. To work on it:
- Open `admin.html` in a browser (or `login.html` to start with auth).
- Supabase credentials are in `js/supabase-client.js` (anon key, safe to keep in code **only** while RLS is enabled on all tables — see ДИАГНОСТИКА.md §4).
- There is no test suite. Verify by exercising the UI in the browser.

## Architecture

### Single-page app with tab navigation

`admin.html` is the entire app shell. Tabs are shown/hidden by `switchTab()` in `admin-ui.js`. Active tab is persisted in `localStorage('active_tab')`.

### JavaScript module loading order (order in admin.html matters)

```
js/supabase.js          ← Supabase UMD bundle (sets window.supabase to the lib namespace)
js/supabase-client.js   ← replaces window.supabase with the live client instance
js/admin/admin-core.js  ← sets up window.Provisio, AppStore, global error handler, apiRequest()
js/admin/admin-db.js    ← all Supabase CRUD; reads window.Provisio set by core
js/admin/admin-reactive.js ← cost/unit/EP% calculation engine; reads window.Provisio data
js/admin/admin-ui.js    ← tab nav, sidebar, toast, modal, search
js/admin/admin-*.js     ← feature modules (ingredients, suppliers, recipes, menu, calculator, purchasing, dashboard, settings, tutorial)
```

Every module guards itself: `const P = window.Provisio; if (!P) { console.error(...); return; }`. Never load a feature module before `admin-core.js`.

### Global state namespace

`window.Provisio` (initialized in `admin-core.js`) holds:
- `AppStore` — session auth, user info, currency, theme, palette; persisted to `localStorage`
- `ingredients`, `suppliers`, `recipes`, `menu_items` — in-memory arrays loaded from Supabase on page load
- `apiRequest()` — legacy n8n HTTP helper (still used for AI-parse features and team invite; dead for everything else)
- `getConversionFactor(ingredient, fromUnit, toUnit)` — unit conversion used by ReactiveEngine

### Cost calculation chain

`window.ReactiveEngine` (in `admin-reactive.js`) implements the full cost chain:

> Suppliers (prices per ingredient) → ReactiveEngine.resolveIngredientPrice() picks lowest price-per-gram → applied to recipe ingredients (adjusted by EP% from ingredients table) → recipe `calculated_cost` → menu_items margin/profit

Calculation is in-memory on every load; `calculated_cost` is **not** currently saved back to `recipes` in Supabase (known issue).

### Database — Supabase (PostgreSQL + RLS)

Target schema: `supabase_schema_new.sql` (v8). Key points:
- All tables have `user_id UUID` referencing `users(id)` (linked to `auth.users`).
- Multi-tenancy via `get_tenant_id()` SQL function — returns owner's ID whether the caller is the owner or a team member.
- RLS enabled on all 12 tables with `user_id = get_tenant_id()` policies.
- **Do not apply** `supabase_migration_v7.sql` — it is the old n8n schema with RLS disabled and will break auth and data isolation.

Main tables: `users`, `ingredients`, `inventory`, `suppliers`, `recipes`, `menu_items`, `user_settings`, `orders`, `applications`, `audit_logs`, `storage_logs`, `team_members`.

JSONB columns used heavily: `recipes.ingredients` (array), `recipes.labor`, `recipes.sub_recipes`, `suppliers.prices`, `suppliers.schedule`, `ingredients.conversions`, `ingredients.nutrition`.

### CSS structure

Four files loaded in order:
```
css/admin/variables.css   ← all CSS custom properties (colors, radii, shadows, fonts)
css/admin/layout.css      ← sidebar, topbar, tab shells
css/admin/components.css  ← cards, buttons, modals, toasts, forms
css/admin/pages.css       ← per-tab overrides
```

Design tokens use semantic names (`--bg-primary`, `--accent-olive`, `--text-secondary`). Legacy aliases exist for old names (`--cream`, `--chocolate`, `--olive`). Dark theme is applied via `body.dark-theme`; color palettes via `body.palette-{classic|emerald|ruby|azure}`.

## Known issues (from ДИАГНОСТИКА.md)

Before touching saving logic, read `ДИАГНОСТИКА.md`. Key bugs:

1. **Column name mismatch** — `calculated_cost` vs `cost`, `sale_price` vs `selling_price` vs `price`, `finished_weight` vs `weight`, `yield_quantity` vs `yield_qty` — data saves under one name, reads under another.
2. **Menu → Recipe link broken** — `parseInt(uuid)` returns `NaN`; `recipe_id` is never saved correctly.
3. **`admin-menu.js`** sends `selling_price` and `is_active` which do not exist in the v8 schema.
4. **`admin-calculator.js`** sends `weight`, `price`, `cost`, `yield_qty` — v8 expects `finished_weight`, `sale_price`, `calculated_cost`, `yield_quantity`.
5. **`admin-recipes.js`** sends `label_tag` — not in v8 schema.
6. **AI parse buttons** call `apiRequest()` → n8n webhook (`https://n8n.shopluminova.online/webhook`) which is no longer maintained.

## Phase 1 vs Phase 2 split

**Phase 1** (current focus): Dashboard, Menu, Recipes, Calculator, Purchasing (expected-sales-based), Ingredients, Suppliers, Settings.

**Phase 2** (deferred, partially in `/archive`): Inventory (live stock), Orders (supplier purchase orders), Team (staff invites via `invite-register.html` + n8n), Notifications, Applications (integrations).

Phase 2 JS files: `admin-inventory.js`, `admin-orders.js`, `admin-team.js` — still loaded but tabs hidden.

## Field name reference (v8 canonical names)

| Concept | Correct column name |
|---|---|
| Cost of recipe | `calculated_cost` |
| Selling price | `sale_price` (recipes) / `price` (menu_items) |
| Portion weight | `finished_weight` |
| Yield amount | `yield_quantity` |
| Yield unit | `yield_unit` |
