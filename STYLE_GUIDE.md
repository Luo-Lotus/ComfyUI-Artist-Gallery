# Prompt Gallery Style Guide

The UI is a **dark-themed** gallery modal (plus a node-canvas widget) over ComfyUI's editor.
Accent color: **#6c5ce7** (purple). A light theme exists via `[data-theme="light"]`, but dark is the default and the reference.

**Golden rule: always use `var(--g-*)` tokens from `web/styles/variables.css`. Never hardcode colors.**

## Tokens (see `web/styles/variables.css` for the full list)

| Group | Tokens |
| --- | --- |
| Backgrounds | `--g-bg-primary/secondary/elevated/hover/input/overlay/gradient` |
| Borders | `--g-border`, `--g-border-light`, `--g-border-hover` |
| Accent | `--g-accent`, `--g-accent-hover`, `--g-accent-light`, `--g-accent-bg` |
| Text | `--g-text`, `--g-text-secondary`, `--g-text-muted`, `--g-text-hint` |
| Semantic | `--g-success/error/warning/info`, `--g-error-bg`, `--g-success-bg` |
| Surfaces | `--g-image-placeholder`, `--g-batch-bg`, `--g-batch-border`, dialog/menu/toast groups |
| Radii | `--g-radius-sm: 4px`, `--g-radius-md: 8px`, `--g-radius-lg: 12px`, `--g-radius-xl: 16px` |
| Motion | `--g-transition-fast: 0.15s ease`, `--g-transition-base: 0.2s ease` |
| Z-index | `--g-z-float: 9999` < `--g-z-modal: 10000` < `--g-z-detail: 10001` < `--g-z-lightbox: 10002` < `--g-z-dialog: 20000` < `--g-z-menu`/`--g-z-toast: 99999` |
| Scrollbars | `--g-scrollbar-track`, `--g-scrollbar-thumb`, `--g-scrollbar-thumb-hover` (wired globally in `base.css`) |
| Card sizing | `--card-*` (computed by `SizePresets.js` from the size slider; `--card-radius` drives `.gallery-card` / `.category-card` radius) |

Z-index caution: some values are set inline in JS (`Dialog.js` = 20000, toast container = 99999). Keep CSS tokens numerically consistent with that layering; do not renumber freely.

## Conventions

### Buttons
- Radius `var(--g-radius-md)` (8px), `1px` borders (never 2px), font `13px` / weight `500`, `transition: all var(--g-transition-fast)`.
- Keep color semantics per variant: `primary` = accent fill, `danger` = `--g-error` fill.
- Header close buttons (`.gallery-modal-header .gallery-modal-btn.primary`) render as quiet ghost buttons; real CTAs live in `.gallery-dialog-actions`.
- Loading state: `.gallery-modal-btn.loading` hides text (`color: transparent`) and shows a centered `::after` spinner.

### Inputs
- `1px solid var(--g-input-border)`, radius `var(--g-radius-md)`; search fields may keep the 16px pill shape (both searches must match).
- Focus: `border-color: var(--g-accent)` + `box-shadow: 0 0 0 3px var(--g-accent-light)`. Keep `outline: none` on `:focus`; keyboard focus rings come from the shared `:focus-visible` rule in `base.css`.

### Cards
- `.gallery-card` and `.category-card` share one look: `border-radius: var(--card-radius, 12px)`, `1px solid var(--g-border-light)`, shadow `0 2px 8px var(--g-shadow-light)`; hover: `translateY(-2px)` + `border-color: var(--g-accent)` + `0 4px 16px var(--g-shadow)`.
- Image containers use `background: var(--g-image-placeholder)`.

### Surfaces & chrome
- Modal/detail radius `var(--g-radius-xl)` (16px); dialogs animate in via `g-dialog-in` (0.18s ease-out).
- Toasts: near-opaque dark background, 3px colored left border per type, `backdrop-filter: blur(8px)`.
- No decorative gradients, no white-sheen overlays, no italic hint text, no underline hovers on toolbar buttons (use rgba background hovers).

### Motion & accessibility
- Hovers/focus: `--g-transition-fast`; entrances: 0.18-0.3s ease-out. `base.css` disables animation under `prefers-reduced-motion`.
- Scrollbars, `accent-color`, `::placeholder` and `:focus-visible` are provided centrally by `web/styles/base.css`, scoped to plugin containers only (never global `*`).

### Files
- One CSS file per feature, all imported via `gallery.css` (`variables.css` first, `base.css` second).
- Do not rename classes (JS depends on them); `prompt-selector.css` was appended over time — later definitions win, so never add earlier-in-file overrides there.
