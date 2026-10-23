# Lineage Collections — Brand Design System Audit

**Purpose:** Phase 0/1 of the website-aligned portal redesign. Documents the *real, verified* design system of the new Lineage Collections website (`https://lineagecollectionswebsite.gabriella-524.workers.dev/`) and how it should be applied to the internal portal. **The website is the design authority** — nothing in this document is invented; every value below was read directly out of the live site's own stylesheet and markup.

**Decision on record:** this system **supersedes** the portal's current sage/olive/ivory/charcoal token set (introduced in the earlier `redesign/portal-ui-polish` → `redesign/lineage-premium-v3` work, see `DESIGN_AUDIT.md`). That system was built from Higgsfield-generated mockups, not this website. Going forward, this document is the source of truth; `DESIGN_AUDIT.md` remains valid for its routing/RBAC/branch-risk findings, which are unrelated to visual design.

---

## 0. Method — what was verified, and how

The site is a static build (no framework bundler obfuscating sources) served from Cloudflare Workers. Instead of relying on visual inspection/screenshots (which this environment can't reliably capture for an external site), I fetched its **actual source files** directly:

- `curl`'d the homepage, dealer-application page, and page markup for nav/mega-menu/footer/forms
- `curl`'d its real stylesheet, `css/styles.css` (5,647 lines) — every color, font, spacing and component value below is quoted directly from it, not estimated
- Confirmed font loading via its real Google Fonts `<link>` tag

**Verified:** color tokens, font families/weights, button/input/card CSS, border-radius conventions, breakpoints, nav/header structure, form patterns, status colors, spacing scale.
**Not verified (no local repo access, no browser automation available):** exact rendered photography art-direction choices, JS-driven interaction timing/easing feel in motion, any pages gated behind the dealer login the environment doesn't have credentials for. Flagging this honestly per the brief's own instruction rather than guessing.

---

## 1. Color

All values are the website's real CSS custom properties, `css/styles.css:5-16`:

| Token | Hex | Role on the website |
|---|---|---|
| `--color-bg` | `#f7f5f0` | Page background — warm, soft off-white (not pure white, not beige) |
| `--color-surface` | `#fdfcf9` | Raised surface (forms, panels) — barely lighter than bg |
| `--color-ink` | `#1d1a17` | Primary text — warm near-black, not pure `#000` |
| `--color-ink-soft` | `#4a4540` | Secondary text |
| `--color-muted` | `#7a736b` | Tertiary text, eyebrows, hints |
| `--color-line` | `#e2ddd5` | Hairline borders/dividers |
| `--color-dark` | `#26221f` | Dark surfaces: announcement bar, dark sections, hover-invert state |
| `--color-sand` | `#e7e2db` | Warm neutral surface (brand "tint" background) |
| `--color-olive` | `#5d5a3e` | The *only* real accent color on the whole site — muted, warm, khaki-leaning olive. Used sparingly: "added to cart" state, a brand's default accent, in-stock-adjacent emphasis. |
| `--color-white` | `#ffffff` | True white, used narrowly (light button fill) |
| `--color-product-bg` | `#ece7e0` | Frame behind cut-out product photography |

**Semantic/status colors** (found in context, not declared as named tokens — the site treats these as one-off, not a formal system):
- Stock **in**: `#5f7d55` (muted sage green), paired with a soft `rgba(95,125,85,.18)` glow ring
- Stock **out/backorder**: `#b98a3e` (warm amber/gold), paired with `rgba(185,138,62,.18)` glow ring
- Form **error**: `#a2412f` (muted brick/terracotta — not a bright red)

**Per-brand accents**: brand pages override `--brand-accent` / `--brand-tint` / `--brand-deep` on `<main>` (defaults: olive / sand / dark, `styles.css:2975-2977`) — a scoped-variable pattern worth reusing for the portal if it ever needs per-brand or per-collection color moments (it currently doesn't, and shouldn't invent one).

**What's absent, deliberately:** no blue, no purple, no neon, no saturated anything. The entire palette is warm neutrals + one muted olive + two muted status colors. This is the single most important fact in this audit — the current portal's neon blue/purple accents have **zero basis** in the brand and must go.

### Current portal state vs. target

The portal's existing `src/index.css` (sage/olive/ivory/charcoal system) is **already closer in spirit** than it might look — it's warm-neutral + olive-accent + charcoal-text, same family as the real site. But the exact values diverge and the *radius/shadow/focus-ring* language (below) is a hard mismatch. This means the retheme is a **refinement of values**, not a rebuild from zero:

| | Portal today (`src/index.css`) | Website (real) |
|---|---|---|
| Canvas | `hsl(42 28% 95%)` ("Ivory") | `#f7f5f0` — close, worth exact-matching |
| Text | `hsl(40 8% 15%)` ("Charcoal") | `#1d1a17` — close, worth exact-matching |
| Accent | `hsl(100 22% 24%)` — a **green-leaning** olive | `#5d5a3e` — a **khaki/brown-leaning** olive, lower saturation. Visibly different color family; needs correcting, not just re-expressing in HSL. |
| Border radius | `--radius: 0.5rem` (8px), described in-file as "softer than architectural" | `0` on buttons/inputs/cards; `50%` only on circular icon buttons; `999px` pill only on a few small specific controls (qty stepper, tags) |
| Focus state | `ring-2` glow + offset (`focus-visible:ring-ring`) | Border-color change only, `outline: none` — no glow |

---

## 2. Typography

Confirmed via the real Google Fonts link (`home.html`) and `css/styles.css:18-19,38-43`:

```css
--font-display: 'Cormorant Garamond', 'Times New Roman', serif;   /* weights loaded: 400, 500, 600, italic 400 */
--font-body:    'Inter', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif;  /* weights loaded: 300, 400, 500 */

body { font-family: var(--font-body); font-weight: 300; font-size: 15px; line-height: 1.6; }
```

**This is the exact same font pairing the portal already uses** (confirmed in `src/index.css:1`) — no font change needed, which de-risks this whole effort considerably. The difference is in *how* it's used:

- **Body weight is 300 (light), not 400**, on the real site. The portal currently defaults heavier. Worth testing — light-300 Inter at 15px is legible on the site's higher-contrast warm-ivory background; verify readability at portal data-density before adopting wholesale on dense tables.
- **Display headings are used *only* for large editorial moments** — hero titles, section heads, brand manifestos, page banners (`clamp(28px…)` up to dramatic `clamp(96px, 15.5vw, 280px)` hero type). Never on body copy, labels, table headers, or form fields — those are 100% Inter, 11–15px, often uppercase with wide letter-spacing for eyebrows (`letter-spacing: .16em–.18em; text-transform: uppercase; font-size: 11px`).
- **Scale is contextual (`clamp()`), not a fixed type ramp.** For the portal, the useful subset is the smaller end: `clamp(28px, 2.3vw, 40px)`–`clamp(36px, 2.4vw, 50px)` reads as "a real page heading" without website-hero drama — appropriate for e.g. the Company-Wide dashboard title, a page's `<h1>`.

**Application to the portal** (per the brief's own instruction, already the right call): Cormorant Garamond for page `<h1>`s and major section headings only; Inter for everything else — tables, KPI numbers, forms, nav, buttons, document names. Do not put Cormorant Garamond in a data table or a dense list — the real site never does.

---

## 3. Spacing & layout

```css
--gutter: clamp(16px, 3.8vw, 56px);
--max-width: 1600px;
```

Container pattern: `width:100%; max-width:var(--max-width); margin-inline:auto; padding-inline:var(--gutter);` — a single generous, fluid gutter rather than a fixed spacing scale. The portal's content area can reasonably adopt a bounded max-width (it currently varies by page) and the same fluid-gutter instinct, scaled down for a denser, operational UI.

**Breakpoints** (desktop-first, `max-width` queries): `1100px`, `900px`, `760px`, `560px`.

---

## 4. Buttons

Real CSS, `css/styles.css:85-106,809-821,1035-1037,1961,3045-3046`:

```css
.btn {
  display: inline-flex; align-items: center; gap: 12px;
  padding: 16px 30px;
  font-size: 13px; font-weight: 400;
  letter-spacing: 0.02em; text-transform: uppercase;
  border: 0; border-radius: 0;
  transition: background-color .3s var(--ease), color .3s var(--ease);
}
.btn-dark    { background: var(--color-ink); color: var(--color-white); }     /* hover: #4a433d */
.btn-light   { background: var(--color-white); color: var(--color-ink); }     /* hover: inverts to dark */
.btn-outline { border: 1px solid var(--color-ink); background: transparent; }
.btn-ghost   { border: 1px solid rgba(255,255,255,.55); color: white; background: transparent; } /* for image overlays */
.btn-raised  { box-shadow: 0 2px 10px rgba(0,0,0,.07); }                      /* the only shadow on any button */
.btn-dot     { width:4px; height:4px; border-radius:50%; background:currentColor; } /* small accent dot before label, used selectively */
```

**Sharp rectangles, uppercase, letter-spaced, flat color fills, no border by default, near-zero shadow.** This is a hard, clear departure from the portal's current `rounded-md` + `shadow-soft` buttons with mixed-case labels. Adopting this means: square corners, uppercase labels for primary actions (not all buttons need the uppercase treatment — the site reserves it for `.btn`, i.e. real CTAs, and uses plain-case text links elsewhere), remove the glow shadow, remove the focus ring-glow in favor of a border/outline change.

---

## 5. Forms

`css/styles.css:1268-1300`:

```css
.field input, .field select, .field textarea {
  width: 100%; padding: 8px 14px;
  border: 1px solid #d6d0c7; border-radius: 0;
  background: var(--color-white); color: var(--color-ink);
  font: inherit; font-size: 15px;
  transition: border-color .2s var(--ease);
}
.field input:focus, .field select:focus, .field textarea:focus { outline: none; border-color: var(--color-ink); }
.field [aria-invalid="true"] { border-color: #a2412f; }
.field-error { font-size: 12px; color: #a2412f; }
```

Flat, square, single hairline border, no shadow. Focus = border darkens to ink, no ring. Error = border + helper text in the terracotta error color, not a red background or icon badge. Select uses a plain custom chevron SVG, not a styled native arrow. File inputs get a dashed border (`.field input[type="file"]`) — a nice, simple "drop zone" cue worth reusing for Digital Assets' upload affordance.

---

## 6. Cards, product grid, and surfaces

Notably, **the website has almost no "card" in the SaaS-dashboard sense.** Product tiles (`.product-grid`, 4-column, 12px gap) are bare: an image on `--color-product-bg`, a name, a price — no border, no shadow, no rounded container. The one bordered/padded "card" pattern that does exist is the contact form panel (`padding: clamp(28px,3.5vw,48px); background: var(--color-surface); border: 1px solid var(--color-line);` — flat border, no shadow, no radius).

**Application to the portal:** this is the clearest single correction for Digital Assets and every other page — stop using heavy bordered/shadowed/rounded "cards" as the default container for *everything*. Reserve a card-like treatment (flat border, no radius, no shadow) for genuinely panel-like content (a form, a KPI summary block); let list/grid items (files, folders, table rows) be as bare as the product grid is.

---

## 7. Navigation

Header (`css/styles.css:135-155,226-260`): sticky, `backdrop-filter: blur(10px)` over a translucent warm-bg, a single hairline bottom border + very soft shadow (`0 4px 14px rgba(0,0,0,.04)`). Nav links: 14px, regular weight, **no background pill on hover/active** — instead an animated underline (`::after { transform: scaleX(0) → scaleX(1) }`), including for the current page (`[aria-current="page"]`). Mega-menus use real imagery + a flat list, no icons.

**Application to the portal:** the portal's sidebar nav currently uses background-fill active/hover states (`bg-sidebar-accent`). The website's convention argues for something more understated — a border-left accent or underline rather than a filled pill — "active but not loud," matching the brief's own instruction ("Active navigation states must be understated but unmistakable"). This is a Phase 1 nav-polish item, not required before Digital Assets ships.

---

## 8. Radius & shadow — the governing rule

Across the entire stylesheet, radius is almost never decorative:

- **`0`** — the default for every structural element: buttons, inputs, cards/panels, images, product tiles
- **`50%`** — circular only: icon buttons, avatars, status dots
- **`999px`** — pill, reserved for a handful of small specific controls (quantity stepper buttons, a zoom-level badge, filter tags)

There is no "soft card" radius (`8px`, `12px`, `16px`) anywhere in the system. This is the biggest structural difference from the current portal (`--radius: 0.5rem` applied broadly via shadcn's `rounded-md`/`rounded-lg`). Shadow is nearly absent — `.btn-raised`'s `0 2px 10px rgba(0,0,0,.07)` is the heaviest shadow found anywhere on the site, and most components have none at all.

---

## 9. What should NOT transfer to the portal

Per the brief's own instruction, called out explicitly:

- **Dramatic hero type** (`clamp(96px…280px)` display headings, full-bleed marquees, brand-rail scroll animations) — marketing theater, wrong register for a workspace
- **Product zoom/lightbox, `mix-blend-mode: multiply` cutout photography treatment** — the portal doesn't sell product photography the same way; irrelevant
- **Mega-menu-with-imagery pattern** — appropriate for 6 nav items on a marketing site, not for the portal's dense, permission-gated, many-section sidebar
- **Uppercase-everything** — the site reserves uppercase for CTAs and eyebrows specifically; applying it to every label/button in a dense operational UI would read as shouting, not elegant
- **The 300-weight body text, unverified at UI density** — needs an actual look-and-feel check on the portal's smaller/denser text before committing; may need 400 for legibility at table-row sizes

---

## 10. Phase 1 — Portal application strategy, summarized

1. **Token pass** (`src/index.css`): re-derive `--background`/`--foreground`/`--primary`/`--border` etc. to the website's real hex values (exact-match bg/ink, correct the olive hue from green-leaning to khaki-leaning, adopt the three real status colors for destructive/warning/success).
2. **Radius pass**: move `--radius` toward `0` (or a near-zero value like `2px` if full-square proves too severe in testing) for buttons/inputs/cards; keep `50%`/pill only where already circular.
3. **Shadow/focus pass**: drop `shadow-soft`/`shadow-elev` as a default; replace glow-ring focus states with a border-color change, matching the site's actual focus treatment.
4. **Typography pass**: keep Cormorant Garamond scoped to real page headings only (already mostly true); verify Inter weight at data-density before changing from 400 to 300 broadly.
5. **Component-by-component rollout**, starting with Digital Assets (Phase 2, next) as the quality bar, then the rest of the portal — this document doesn't re-litigate routing/RBAC/IA, which `DESIGN_AUDIT.md` already covers and which this redesign must not disturb.

No backend logic, data, or sync scripts are touched by any of this — purely `src/index.css` + component-level Tailwind class changes.
