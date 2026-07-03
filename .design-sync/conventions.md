## Connect 41 — build conventions

**No provider needed.** Connect 41 has no theme/context provider to wrap your app in. Dark mode is a plain DOM attribute: set `data-theme="dark"` (or `"light"`) on the root element (`<html>` in the real app) — every color token flips automatically via a CSS `@custom-variant`. There is nothing to import or mount for this to work.

**Styling idiom: Tailwind utility classes over CSS custom properties.** Every color is a token, never a raw hex value. The real families (from `styles.css`'s `@theme` block):

| Purpose | Classes |
|---|---|
| Backgrounds | `bg-canvas` (page), `bg-surface` (cards), `bg-surface-2` (subtle/hover), `bg-brand` (primary action) |
| Text | `text-fg` (primary), `text-fg-secondary`, `text-fg-muted` (labels/hints), `text-on-brand` (on `bg-brand`) |
| Borders | `border-border`, `border-border-strong` |
| Brand scale | `bg-brand-50` … `bg-brand-900` (and `text-`/`border-` equivalents), plus `bg-brand-hover`, `bg-brand-subtle` |
| Semantic | `success`, `warning`, `danger`, `info` — each as `bg-*`, `text-*`, `border-*` (e.g. `bg-danger/10 text-danger border-danger/25` is the standard "status pill" pattern used throughout) |
| Sector colors | `bg-sector-tech`, `-dprh`, `-recrutamento`, `-societario`, `-financeiro`, `-fiscal`, `-contabil`, `-bpo`, `-comercial`, `-corretora`, `-gestao` — used as small colored dots/badges to tag which business sector a record belongs to |
| Radius | `rounded-sm` (4px) `rounded-md` (6px, most common for inputs/buttons) `rounded-lg` (8px, cards) `rounded-xl` (12px) |
| Type | `font-sans` (IBM Plex Sans), `font-mono` (IBM Plex Mono, for tabular numbers via the `tnum` class) |

Never invent a new color name — if a shade you need isn't in this table, use the closest existing token rather than a raw Tailwind color (`text-blue-500` etc. do not exist in this system).

**Real component sizing, not ad-hoc.** Buttons/inputs are consistently `h-8` (compact, e.g. table row actions) or `h-9` (primary form actions); text is small — `text-[11px]`–`text-[13px]` for body/labels, `text-[16px]`–`text-[23px]` only for page/section titles. Match this scale rather than defaulting to larger UI-kit sizes.

**Where the truth lives.** `styles.css` (root) `@import`s the full token/utility closure — read it before styling anything custom. Per-component `.prompt.md` files show real prop shapes and usage.

**Build snippet** (a status pill + primary action, the most common composed pattern in this system):

```tsx
<span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border bg-success/10 text-success border-success/25">
  Ativo
</span>
<button className="h-9 px-5 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover transition-colors">
  Salvar
</button>
```
