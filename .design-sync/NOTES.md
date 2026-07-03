# design-sync notes — connect-41

## Repo shape

No Storybook, no build/dist step for `src/components` — this is the `package`
shape run in synth-entry mode (no real npm package, `pkg`/`globalName` are
synthetic). `srcDir` is scoped to `src/components` only; the rest of `src/`
(app pages, api routes, lib, generated Prisma client) is intentionally out of
scope — see "Re-sync risks" below for why that boundary matters.

## Known render warns

- `LockIcon`, `MailIcon`, `MessageIcon`, `PhoneIcon`, `UserIcon`: authored,
  screenshots confirmed correct (small stroke-only 20x20 SVGs, `currentColor`
  correctly inherits the wrapper's `color`). The render check's "paints
  nothing" heuristic doesn't recognize stroke-only, textless icon SVGs as
  painted content — false positive, triaged as benign. A re-sync should NOT
  treat this warn as new.

## Naming collision: DeleteButton

`src/components/empresas/DeleteButton.tsx`, `kanban/DeleteButton.tsx`, and
`pessoas/DeleteButton.tsx` all export a component literally named
`DeleteButton` — three distinct, unrelated components. A plain `export *`
synth entry silently drops an ambiguous same-name star-export (ES module
semantics), so none of the three ever reached `window.Connect41` upstream.
Fixed via the `source-kit.mjs` fork (see `libOverrides` in config.json):
collisions are disambiguated by parent-dir prefix (`EmpresasDeleteButton`,
`KanbanDeleteButton`, `PessoasDeleteButton`) and re-exported with an explicit
named alias in the synth entry, which isn't subject to the ambiguous-export
drop. If a future component add introduces another same-name collision, the
fork's `scanExportsByFile` handles it automatically — no config change needed.

## Excluded component

- `NotificationItem` (`src/components/shell/NotificationItem.tsx`): the only
  component that value-imports (not just types) a real Next.js server action
  (`marcarNotificacaoLida`), which transitively pulls in `@prisma/client` +
  the `mariadb` driver into the browser bundle. Excluded via
  `componentSrcMap: {"NotificationItem": null}` — this only works because the
  `source-kit.mjs` fork also filters the *synth entry* by this map (upstream
  only filtered the post-hoc component list, so the file still broke the
  bundle even after "excluding" it the normal way).

## Forks (`.design-sync/overrides/`)

- `source-kit.mjs` — see collision + exclusion notes above. Declared in
  `cfg.libOverrides`.
- `bundle.mjs` — broadens esbuild's `define` from the upstream
  `process.env.NODE_ENV`-only key to a full `process` object shim. Real
  `next/link`/`next/navigation` runtime code gets bundled (not just types),
  and reads many `process.env.__NEXT_*` flags the narrow define never
  matched; browsers have no `process` global at all, so every unmatched read
  threw `ReferenceError` and broke literally every preview (100% render
  failure) until this fix. Only the `define` object changed — the
  `@ds-bundle` header / manifest contract in `bundleToIife`/`stampHeader` is
  untouched.

## CSS: compiled, not raw-copied

`cssEntry` points at `.design-sync/.cache/compiled-globals.css`, NOT the raw
`src/app/globals.css`. The raw file starts with `@import "tailwindcss";` —
Tailwind v4's own PostCSS plugin syntax, not a real stylesheet import — so
copying it verbatim shipped a stylesheet that referenced a non-existent
`tailwindcss` file and defined zero real utility classes. `.ds-sync/compile-css.mjs`
runs the file through the repo's own `@tailwindcss/postcss` (the same plugin
`postcss.config.mjs` uses) to produce a real compiled stylesheet with actual
`--c41-*` token definitions and utility classes. **Re-sync must re-run this
compile step** (`node .ds-sync/compile-css.mjs`) before the converter if
`globals.css` changed — the cached compiled file does not auto-update.

## Windows-specific build plumbing (re-sync must redo this)

This repo's own directory (`src/generated/prisma`) is regenerable Prisma
output but NOT what caused the original build to fail — see below for the
actual cause. None of this is about that; it's about how `--node-modules` is
pointed for synth-entry mode on Windows:

- **`--node-modules` must NOT point at the repo's own `node_modules` with a
  junction back to the repo added inside it.** Early attempts placed a
  `node_modules/connect-41 -> <repo root>` junction directly inside the real
  `node_modules/`, which creates a filesystem cycle (repo root contains
  `node_modules`, which contains a junction back to repo root). A recursive
  `.d.ts` glob in `lib/dts.mjs`'s `exportedNames`/`findTypesRoot` (falls back
  to scanning the whole `pkgDir` when no `types`/`dist` field exists — true
  here) recurses into that cycle and OOMs Node (~4GB heap, ~5 min to crash).
  **Fix**: stage an external `node_modules`-named directory OUTSIDE the repo
  (this run used the Claude scratchpad temp dir) containing junctions to
  `react`, `react-dom`, `@types` (from the real `node_modules`) and a
  `connect-41` junction to the repo root. This directory must be literally
  named `node_modules` (not any other name) — esbuild's bare-import
  resolution for `vendorReact` depends on the parent-of-resolveDir's own
  `node_modules` lookup landing back on itself, which only works if that's
  the literal folder name.
- **Side effect**: `dirname(--node-modules)` lives outside this repo's git
  tree, so `gitWorkspaceRoot()` can't find `connect-41/.git` walking up from
  there — `cfgPath()`'s workspace-root containment check then skips
  `tsconfig` (the custom `tsconfigPathsPlugin`) and `guidelinesGlob`
  (harmless — `docs/` here is unrelated planning docs, not design
  guidelines, so skipping it is actually correct). The custom tsconfig paths
  plugin being skipped is NOT a problem in practice: esbuild has its own
  native tsconfig `paths`/`baseUrl` discovery (separate from the custom
  plugin) that walks up from each real source file and finds the true
  `tsconfig.json` through the junction via ordinary forward directory
  traversal (which junctions handle fine — only the *upward*, cycle-prone
  walk was the problem). Verified empirically: `@/...` aliased imports
  (`@/components/shared/BulkActionBar` etc.) are correctly inlined in
  `_ds_bundle.js`, not left as unresolved `require()` calls.
- The staging `node_modules` dir is NOT committed (it's outside the repo
  entirely) — a re-sync on a fresh machine must recreate it before running
  the converter. See the `--node-modules` path in the build commands below.

## Fidelity gaps closed (2026-07-04)

The first sync only authored per-component previews — fine for isolated pieces,
but the 3 screens actually prioritized for the redesign (Login, Shell, Kanban)
need to be evaluated as *assembled screens*, not fragments. Two gaps fixed:

- `AuthShell.tsx` preview was only the two input fields — missing "Lembrar de
  mim", "Esqueceu a senha?", the submit button, and the "Solicitar acesso"
  footer link that the real `src/app/login/page.tsx` has. Rewrote it as a full
  composition (`Login` + `LoginComErro` variant) matching the real page.
- No composed Shell existed at all — only loose `NavItem`/`SectorNavItem`/
  `ProfileMenu`/`NotificationBell`/`ThemeToggle`/`WorkspaceSwitcher` previews,
  and `GlobalSearch` (the topbar search — a core piece of this same priority
  screen) had **no preview at all**. Added `GlobalSearch.tsx` (standalone) and
  `AppShell.tsx` (full sidebar+topbar composed together, mirroring
  `src/app/(app)/layout.tsx`) with stub tenants/sectors/notification data.
  Registered `AppShell` in `cfg.overrides` with a `1280x800` viewport (same
  pattern as `AuthShell`'s `1280x700`) since it's a full-width layout, not a
  single component — the default card viewport would clip the 220px sidebar +
  content area.

**A re-sync must re-run the full build pipeline** (compile-css, bundle,
Windows node_modules staging as documented above) to pick these up — editing
just the `.tsx` preview source here does not by itself update what's live in
the claude.ai/design project.

## Re-sync risks

- The compiled CSS cache (`.design-sync/.cache/compiled-globals.css`) is
  gitignored and gets stale silently if `src/app/globals.css` changes —
  re-run `node .ds-sync/compile-css.mjs` before every rebuild, not just the
  first one.
- The external staging `node_modules` directory (see above) doesn't survive
  a fresh clone or a new machine — it must be recreated (4 junctions: react,
  react-dom, @types, and the repo itself) before `--node-modules` can point
  at it. Forgetting this reproduces either the vendorReact resolution error
  (wrong location) or the OOM (junction placed back inside the repo).
- `componentSrcMap`/collision-handling logic lives entirely in the
  `source-kit.mjs` fork — if design-sync ships a new upstream version of
  that adapter, diff it against the fork before adopting (per the base
  skill's fork-diff guidance) rather than blindly overwriting.
- Only `src/components/**` is synced (`cfg.srcDir`). If new app-level
  reusable UI gets added elsewhere (e.g. a future `src/ui/` folder), it
  won't be picked up without updating `cfg.srcDir`/`cfg.componentSrcMap`.
- Authored previews use hand-written stub data/actions (server actions are
  never actually invoked in the static preview harness) — if real action
  signatures change, previews still compile (esbuild doesn't type-check) but
  may drift from the real prop contract silently. No automated check catches
  this; only re-reading the real usage sites on a future sync would.
