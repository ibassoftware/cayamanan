# Design System — Agent Instructions

This skill describes the visual design language for all UI output. Every component, layout, and page should follow the design specs in the module files below. These describe *what the design looks like* — you choose how to implement the styles.

## Style
A sun-baked, clay-toned editorial interface built on warm cream surfaces, ink-brown headlines set in a display serif, and a single terracotta accent. Earthy, human, and content-first — tuned for long-form reading, blogs, storytelling, and editorial layouts where readability and visual rhythm matter.


## Before Writing Any Code

1. **Read every module that applies.** For a landing page, read at minimum: `layout.md`, `typography.md`, `colors.md`, `buttons.md`, `cards.md`, `shadows.md`, `radius.md`, `borders.md`. Do NOT write any UI until you have loaded all relevant modules.

## Critical Rules

- **Tokens are AGNOSTIC, framework-neutral:** The tokens defined in the `.md` files (like `neutral-primary-soft`, `heading`, `border-default`) are agnostic design system tokens. They are NOT literal class names from any CSS framework or utility library. You are responsible for mapping them to whatever styling layer your project uses. Never assume a token name maps directly to a pre-existing class.

- **Cross-reference modules.** A card containing buttons must satisfy both `cards.md` AND `buttons.md`.
- **Dark mode is automatic.** The color tokens resolve differently in light/dark via the user's color-scheme preference. Never manually swap colors.
- **Every interactive element needs hover, focus, and disabled states** — defined in the relevant module.
- **Use semantic HTML:** proper heading hierarchy (`h1`→`h6`), `<button>` for actions, `<a>` for navigation, ARIA attributes where needed.
- **Single accent rule.** Brand terracotta is the sole interaction driver. Reserve it for the primary action per screen and for emphasis. Never compete it with another saturated accent.
- **One surface color across all sections.** Sections do not alternate background colors — the page rhythm is carried by typography, cards, and negative space, not by background contrast.

## Module Index

### Foundation (read first for any UI work)
- [colors.md](colors.md) — all background, text, and border color tokens
- [typography.md](typography.md) — heading scale, paragraphs, labels, links
- [layout.md](layout.md) — spacing rhythm, containers, animation, visual depth
- [radius.md](radius.md) — border-radius scale
- [shadows.md](shadows.md) — elevation tokens
- [borders.md](borders.md) — border widths and styles

### Components
- [buttons.md](buttons.md) — button variants, sizes, states, glint effect
- [button-group.md](button-group.md) — grouped button structure
- [cards.md](cards.md) — card structure, background, interactivity
- [inputs.md](inputs.md) — form controls, labels, states
- [alerts.md](alerts.md) — alert variants
- [badges.md](badges.md) — badge variants, sizes, dismissible chips
- [lists.md](lists.md) — list components
- [avatars.md](avatars.md) — avatar variants, sizes, indicators
- [icon-shapes.md](icon-shapes.md) — icon containers

### Complex Components
- [accordion.md](accordion.md) — accordion variants
- [dropdown.md](dropdown.md) — dropdown menus
- [modals.md](modals.md) — modal dialogs
- [tabs.md](tabs.md) — tab navigation
- [tables.md](tables.md) — table structure
- [pagination.md](pagination.md) — pagination components
- [sidebars.md](sidebars.md) — sidebar navigation
- [radios-checkboxes-toggle.md](radios-checkboxes-toggle.md) — selection controls
- [tooltips-popovers.md](tooltips-popovers.md) — tooltips and popovers
- [content.md](content.md) — grid system, responsiveness

---

## Source file: `accordion.md`

# Accordion

> Dependencies: `colors.md`, `radius.md`

## Core Specs

- **Wrapper:** full width, 1px border (border-default color), 16px radius — clips first/last item corners
- **Item separator:** 1px bottom border (border-default) on every item except last

## Trigger (Button)

- **Layout:** flex, space-between, full width
- **Padding:** 20px horizontal, 18px vertical
- **Font:** DM Sans, 15px, medium weight
- **Text color:** heading
- **Background:** neutral-tertiary
- **Hover:** neutral-tertiary-medium background
- **Focus:** outline none, 2px ring in brand color
- **Transition:** colors, 200ms
- **Open state:** neutral-tertiary-medium background

## Panel (Content)

- **Padding:** 20px horizontal, 18px vertical
- **Background:** neutral-primary-soft
- **Top border:** 1px, border-default color
- **Font:** DM Sans, 15px, body color, 1.7 line-height

## Chevron Icon

- Size: 16x16px
- Color: body text color
- Closed: 0deg rotation
- Open: 180deg rotation
- Transition: transform, 150ms

## Variants

### Default (Collapse)
One panel open at a time. Items stacked inside a single shared bordered/rounded wrapper.

### Separated Cards
Each item is independent — has its own 1px border, 16px radius, and shadow-xs. 8px bottom margin between items. No shared outer border.

### Always Open
Multiple panels can expand simultaneously. Same styling as Default.

### Flush
No outer border. Trigger and panel have transparent backgrounds. Only bottom border dividers between items. Use inside containers that already provide a background.

## States

| State | Trigger appearance |
|---|---|
| Closed | heading text, neutral-tertiary background |
| Open | heading text, neutral-tertiary-medium background |
| Hover | neutral-tertiary-medium background |
| Focus | 2px brand ring, no outline |
| Disabled | fg-disabled text, not-allowed cursor, no hover/focus |

---

## Source file: `alerts.md`

# Alerts

> Dependencies: `colors.md`, `radius.md`

## Core Specs

- **Padding:** 16px
- **Radius:** 16px (base)
- **Border:** 1px
- **Heading:** DM Sans, 16px, medium weight
- **Body:** DM Sans, 14px, normal weight, 1.6 line-height

## Variants

### Brand
- **Background:** brand-softer
- **Border:** border-brand-subtle
- **Text:** fg-brand-strong

### Success
- **Background:** success-soft
- **Border:** border-success-subtle
- **Text:** fg-success-strong

### Danger
- **Background:** danger-soft
- **Border:** border-danger-subtle
- **Text:** fg-danger-strong

### Warning
- **Background:** warning-soft
- **Border:** border-warning-subtle
- **Text:** fg-warning

---

## Source file: `avatars.md`

# Avatars

> Dependencies: `colors.md`, `radius.md`

## Core Specs

- **Circular shape:** fully rounded (9999px)
- **Rounded square shape:** 16px radius
- **Default size:** 40x40px
- **Image fit:** cover

## Sizes

| Size | Dimensions | Radius |
|---|---|---|
| Extra Small | 18x18px | 4px |
| Small | 24x24px | 8px |
| Base | 32x32px | 16px |
| Large | 44x44px | 16px |
| XL | 56x56px | 16px |
| 2XL | 64x64px | 16px |

## Bordered Avatar

- 4px padding, fully rounded, 2px outline in border-default color
- Alternative: 2px box-shadow ring in border-default color

## Stacked Avatars

- Displayed in a row (flex)
- Each avatar: 40x40px, fully rounded, 2px border in border-buffer color
- Overlap: -16px negative margin on all except first

### Stacked Counter
- Same size as avatars (40x40px), fully rounded
- Background: dark-strong, text: white, 12px font, medium weight
- Same overlap margin as other avatars

## Avatar with Text

- Flex row, 10px gap between avatar and text
- Avatar: 40x40px, fully rounded, cover fit
- Name: DM Sans, heading color, medium weight
- Subtitle: DM Sans, 14px, body color

---

## Source file: `badges.md`

# Badges

> Dependencies: `colors.md`, `radius.md`

## Core Specs

- **Border:** 1px
- **Default radius:** 8px (small inline pill-adjacent shape)
- **Pill radius:** 9999px
- **Font:** DM Sans, medium weight (500)

## Sizes

| Size | Font size | Horizontal padding | Vertical padding |
|---|---|---|---|
| Default (small) | 12px | 8px | 3px |
| Large | 14px | 10px | 5px |

## Variants

### Brand
- **Background:** brand-softer
- **Border:** border-brand-subtle
- **Text:** fg-brand-strong

### Alternative (Neutral Soft)
- **Background:** neutral-tertiary
- **Border:** border-default
- **Text:** heading

### Gray (Neutral Medium)
- **Background:** neutral-tertiary-medium
- **Border:** border-default
- **Text:** heading

### Danger
- **Background:** danger-soft
- **Border:** border-danger-subtle
- **Text:** fg-danger-strong

### Success
- **Background:** success-soft
- **Border:** border-success-subtle
- **Text:** fg-success-strong

### Warning
- **Background:** warning-soft
- **Border:** border-warning-subtle
- **Text:** fg-warning

### Dark
- **Background:** dark
- **Border:** transparent
- **Text:** white

## Pill Badges

Use 9999px radius instead of 8px on any variant.

## Badges with Icons

- Icon size (default): 12x12px
- Icon size (large): 14x14px
- Icon spacing: 4px margin next to label

## Icon-only Badge

Square shape — equalize dimensions to 24x24px, no horizontal text padding.

## Dismissible Badges

Badge content + a close button. Close button hover backgrounds per variant:

| Variant | Close button hover background |
|---|---|
| Brand | brand-soft |
| Alternative | neutral-tertiary-medium |
| Gray | neutral-quaternary |
| Danger | danger-medium |
| Success | success-medium |
| Warning | warning-medium |

## Dot / Notification Badge

- Positioned absolutely: -4px top, -4px right
- Size: 12x12px, fully rounded
- 2px border in border-buffer color
- Background: danger

---

## Source file: `borders.md`

# Borders

## Width Scale

| Context | Width |
|---|---|
| Default (inputs, buttons, cards, navbar) | 1px |
| Emphasis / focus | 2px |

## Default Border Color

The default border across the system uses **border-default** (`#E2D9C8` light / `#2B1D14` dark) — a warm parchment tone that reads as a soft outline against the cream surface, never as a hard line.

## Rules

- Use solid borders by default
- Dashed borders only for special cases like file dropzones
- Components in the same family must use matching border widths
- Never mix 1px and 2px borders within a single component
- Borders should always feel soft and warm — never harsh black or cold gray

## Usage

| Context | Width | Color token |
|---|---|---|
| Inputs / selects / textareas | 1px default; 2px on focus or error | border-default-medium → border-brand on focus |
| Buttons | 1px for variants that require outlining | border-default |
| Cards / containers | 1px subtle; avoid stacked heavy borders | border-default |
| Navbar / sidebar dividers | 1px | border-default |
| Dividers between content blocks | 1px | border-light |

---

## Source file: `button-group.md`

# Button Groups

> Dependencies: `buttons.md`, `colors.md`, `radius.md`

## Core Specs

- **Wrapper:** inline-flex, 16px radius, shadow-xs
- **Children overlap:** -1px left margin on all except first button
- **Buttons inside the group must NOT have individual shadows.** Only the wrapper has a shadow.
- **Buttons inside the group should use a single flat color (the variant's solid token), not a gradient — gradients only render correctly on the outer rounded silhouette of an isolated button.**

## Anatomy

### Wrapper
- Display: inline-flex
- Radius: 16px
- Shadow: shadow-xs

### First Button
- 16px radius on inline-start side only, 0 on inline-end

### Middle Button(s)
- No radius (0 on all corners)

### Last Button
- 16px radius on inline-end side only, 0 on inline-start

### All buttons except first
- -1px left margin to overlap borders

## Rules

- Buttons inside groups follow all styles from `buttons.md` (background, border, focus rings) except individual shadows and gradients
- Icon-only buttons: 16x16px icon, match height of text buttons

---

## Source file: `buttons.md`

# Buttons

> Dependencies: `colors.md`, `radius.md`, `shadows.md`, `typography.md`

## Core Specs (every button except ghost and disabled)

- **Radius:** 16px (base) or 9999px for pills
- **Border:** 1px solid
- **Shadow:** shadow-xs
- **Glint effect:** Every button except ghost and disabled gets a combined box-shadow that layers the base shadow with an inset top-edge highlight and a subtle outer color glow:
  - `var(--shadow-xs), inset var(--color-1-400) 0 6px 0px -5px, var(--color-1-700) 0 4px 10px -5px`
- **Font:** DM Sans
- **Font weight:** 500 (medium)
- **Box sizing:** border-box
- **Transition:** background and color transitions on hover, 200ms

## Sizes

| Size | Font size | Horizontal padding | Vertical padding |
|---|---|---|---|
| Extra small | 12px | 12px | 6px |
| Small | 14px | 14px | 8px |
| Base (default) | 15px | 18px | 10px |
| Large | 16px | 22px | 12px |
| Extra large | 17px | 26px | 14px |

## Variants

### Brand (Primary)
- **Background:** `linear-gradient(to bottom right, brand, brand-strong)` — terracotta gradient (lighter at top-left, darker at bottom-right)
- **Border:** transparent
- **Text:** white
- **Hover:** `linear-gradient(to bottom right, brand-strong, brand-strong)` — settles into the deeper terracotta
- **Focus ring:** 4px, brand-medium color
- **Glint:** yes
- **Use:** the single primary action per screen

### Secondary
- **Background:** `linear-gradient(to bottom right, gray, quaternary-medium)` — secondary taupe gradient (lighter at top-left, darker at bottom-right; resolves with the warm secondary tone and its darker shade)
- **Border:** transparent
- **Text:** white
- **Hover:** `linear-gradient(to bottom right, quaternary-medium, quaternary-medium)`
- **Focus ring:** 4px, neutral-tertiary-medium color
- **Glint:** yes

### Tertiary
- **Background:** `linear-gradient(to bottom right, gray, quaternary-medium)` — same secondary-color gradient
- **Border:** 1px, border-default
- **Text:** white
- **Hover:** `linear-gradient(to bottom right, quaternary-medium, quaternary-medium)`
- **Focus ring:** 4px, neutral-tertiary-soft color
- **Glint:** yes

### Success
- **Background:** `linear-gradient(to bottom right, success, success-strong)`
- **Border:** transparent
- **Text:** white
- **Hover:** `linear-gradient(to bottom right, success-strong, success-strong)`
- **Focus ring:** 4px, success-medium color
- **Glint:** yes

### Danger
- **Background:** `linear-gradient(to bottom right, danger, danger-strong)`
- **Border:** transparent
- **Text:** white
- **Hover:** `linear-gradient(to bottom right, danger-strong, danger-strong)`
- **Focus ring:** 4px, danger-medium color
- **Glint:** yes

### Warning
- **Background:** `linear-gradient(to bottom right, warning, warning-strong)`
- **Border:** transparent
- **Text:** white
- **Hover:** `linear-gradient(to bottom right, warning-strong, warning-strong)`
- **Focus ring:** 4px, warning-medium color
- **Glint:** yes

### Dark
- **Background:** `linear-gradient(to bottom right, dark, dark-strong)`
- **Border:** transparent
- **Text:** white
- **Hover:** `linear-gradient(to bottom right, dark-strong, dark-strong)`
- **Focus ring:** 4px, neutral-tertiary-medium color
- **Glint:** yes

### Ghost (NO shadow, NO glint)
- **Background:** transparent
- **Border:** transparent
- **Text:** heading color
- **Hover:** neutral-secondary-medium background
- **Focus ring:** 4px, neutral-tertiary-medium color
- **No shadow, no glint effect, no gradient**

### Disabled (NO shadow, NO glint)
- **Background:** disabled token (flat, no gradient)
- **Border:** border-default-medium
- **Text:** fg-disabled color
- **Cursor:** not-allowed
- **No hover, no focus, no shadow, no glint, no gradient**

## Gradient Direction

- All gradient buttons share the same direction: `to bottom right` (top-left lighter, bottom-right darker)
- The "darker" stop is always the corresponding `*-strong` token of the same color family
- This consistent diagonal gives a unified, sun-warmed surface treatment across every variant

## Icons in Buttons

- Icon size: 16x16px
- Spacing: 8px gap between icon and label
- Layout: inline-flex, vertically centered

---

## Source file: `cards.md`

# Cards

> Dependencies: `colors.md`, `radius.md`, `shadows.md`, `typography.md`

## Core Specs

- **Background:** neutral-tertiary (warmer cream — sits one shade darker than the page surface for clear visual separation)
- **Border:** 1px, border-default color
- **Radius:** 16px (base)
- **Shadow:** shadow-xs

## Card Heading

- Font: DM Serif Display
- Desktop: 22px, regular weight (400), heading color
- Mobile: 18px, regular weight (400), heading color
- Never skip heading levels — the page hierarchy must logically arrive at the card heading level.

## Card Body Text

- Font: DM Sans, body color, line-height 1.7

## States

### Static Card (no interactivity)
- Background: neutral-tertiary
- Border: 1px, border-default
- Radius: 16px
- Shadow: shadow-xs
- No hover styles. Non-interactive cards must NOT have hover background changes.

### Interactive Card (clickable)
- Same base styles as static card
- Hover: neutral-tertiary-medium background
- Transition: colors, 200ms
- Cursor: pointer

## Rules

- Background: neutral-tertiary (always one shade warmer/darker than the page surface so cards visibly lift off the section)
- Border: 1px, border-default
- Radius: 16px
- Shadow: shadow-xs
- Interactive hover: neutral-tertiary-medium background
- Non-interactive: no hover styles
- Cards never use a gradient background — gradients are reserved for buttons

---

## Source file: `colors.md`

# Color Tokens

## Background Tokens

### Neutral
| Token | Light | Dark |
|---|---|---|
| neutral-primary-soft | #FBF4E7 | #1F1610 |
| neutral-primary | #FBF4E7 | #18110B |
| neutral-primary-medium | #F3E8D8 | #2B1D14 |
| neutral-primary-strong | #EADDC6 | #3A2818 |
| neutral-secondary-soft | #FBF4E7 | #1F1610 |
| neutral-secondary | #FBF4E7 | #18110B |
| neutral-secondary-medium | #F3E8D8 | #2B1D14 |
| neutral-secondary-strong | #EADDC6 | #3A2818 |
| neutral-tertiary-soft | #F3E8D8 | #2B1D14 |
| neutral-tertiary | #F3E8D8 | #2B1D14 |
| neutral-tertiary-medium | #E2D9C8 | #3A2818 |
| neutral-quaternary | #E2D9C8 | #3A2818 |
| quaternary-medium | #C8B89E | #4D3624 |
| gray | #A89378 | #5C4938 |

### Brand
| Token | Light | Dark |
|---|---|---|
| brand-softer | #FBEDE3 | #3D1F0E |
| brand-soft | #F4D5BF | #5A2E15 |
| brand | #C56A3C | #D8825A |
| brand-medium | #E89971 | #5A2E15 |
| brand-strong | #9C4F25 | #C56A3C |

### Status
| Token | Light | Dark |
|---|---|---|
| success-soft | #EEF3E0 | #1F2A0F |
| success | #6B8B3F | #88A85C |
| success-medium | #DCE6BD | #2B3818 |
| success-strong | #4A6128 | #6B8B3F |
| danger-soft | #FBE8E0 | #3D140A |
| danger | #B83A1F | #D54A2A |
| danger-medium | #F4C9B5 | #6B1F0E |
| danger-strong | #8B2812 | #B83A1F |
| warning-soft | #FBEFD8 | #3D2810 |
| warning | #D49032 | #E5A045 |
| warning-medium | #F4DCA8 | #6B4A18 |
| warning-strong | #9C6418 | #D49032 |

### Button Glint (custom properties, used for the glint box-shadow effect)
| Variable | Light | Dark |
|---|---|---|
| `--color-1-400` | rgba(255,244,231,0.30) | rgba(251,244,231,0.10) |
| `--color-1-700` | rgba(43,29,20,0.18) | rgba(0,0,0,0.30) |

### Utility
| Token | Light | Dark |
|---|---|---|
| dark | #2B1D14 | #2B1D14 |
| dark-strong | #18110B | #3A2818 |
| disabled | #EADDC6 | #2B1D14 |

### Accent (warm, earthen-leaning)
| Token | Value (same both modes) |
|---|---|
| purple | #9C5C9E |
| sky | #6B9BB8 |
| teal | #5C8B82 |
| pink | #C5708B |
| cyan | #6B9BA8 |
| fuchsia | #B85C8E |
| indigo | #6E6E9C |
| orange | #D88B5C |

## Text Color Tokens

### Base
| Token | Light | Dark |
|---|---|---|
| white | #FFFFFF | #FFFFFF |
| black | #2B1D14 | #2B1D14 |
| heading | #2B1D14 | #FBF4E7 |
| body | #5C4938 | #C8B89E |
| body-subtle | #8B6F5B | #A89378 |

### Brand
| Token | Light | Dark |
|---|---|---|
| fg-brand-subtle | #F4D5BF | #5A2E15 |
| fg-brand | #C56A3C | #D8825A |
| fg-brand-strong | #9C4F25 | #E89971 |

### Status
| Token | Light | Dark |
|---|---|---|
| fg-success | #4A6128 | #88A85C |
| fg-success-strong | #3D5020 | #A6C278 |
| fg-danger | #8B2812 | #E5704F |
| fg-danger-strong | #6B1F0E | #E5907A |
| fg-warning-subtle | #D49032 | #E5A045 |
| fg-warning | #6B4A18 | #E5BD78 |
| fg-disabled | #A89378 | #5C4938 |

### Informational / Accent
| Token | Light | Dark |
|---|---|---|
| fg-yellow | #D4A018 | #E5BD45 |
| fg-info | #4A4A78 | #A0A0D8 |
| fg-purple | #8B4F88 | #B878B8 |
| fg-purple-strong | #6B3A6B | #D4A0D4 |
| fg-cyan | #4A788B | #78A8B8 |
| fg-indigo | #4F4F8B | #7878B8 |
| fg-pink | #B85C7C | #B85C7C |
| fg-lime | #708B3C | #A8C278 |

## Border Color Tokens

| Token | Light | Dark |
|---|---|---|
| border-dark | #2B1D14 | #5C4938 |
| border-buffer | #FBF4E7 | #18110B |
| border-buffer-medium | #FBF4E7 | #2B1D14 |
| border-buffer-strong | #FBF4E7 | #3A2818 |
| border-muted | #F3E8D8 | #1F1610 |
| border-light-subtle | #F0E5D0 | #1F1610 |
| border-light | #EADDC6 | #2B1D14 |
| border-light-medium | #E2D9C8 | #3A2818 |
| border-default-subtle | #E2D9C8 | #1F1610 |
| border-default | #E2D9C8 | #2B1D14 |
| border-default-medium | #E2D9C8 | #3A2818 |
| border-default-strong | #C8B89E | #5C4938 |
| border-success-subtle | #C5D89E | #2B3818 |
| border-success | #6B8B3F | #4A6128 |
| border-danger-subtle | #F0BFA8 | #6B1F0E |
| border-danger | #8B2812 | #8B2812 |
| border-warning-subtle | #F0CB8E | #6B4A18 |
| border-warning | #D49032 | #D49032 |
| border-brand-subtle | #F4D5BF | #5A2E15 |
| border-brand-light | #C56A3C | #C56A3C |
| border-brand | #C56A3C | #D8825A |
| border-dark-subtle | #2B1D14 | #3A2818 |
| border-purple | #9C5C9E | #9C5C9E |
| border-orange | #D88B5C | #D88B5C |

## Semantic Usage Rules

- Page/section backgrounds: surface cream tone — every section uses the same single surface color (no alternating)
- Cards over surface: warmer cream tone (one shade darker than surface) for clear visual separation
- Primary buttons: brand terracotta with a subtle gradient (top-left lighter brand → bottom-right darker brand)
- Headings: heading text color set in the display serif
- Body text: body text color set in the body sans
- CTA links: fg-brand text color
- Default borders: border-default (warm parchment outline)
- Status borders match intent: success → border-success, danger → border-danger, warning → border-warning
- Disabled: disabled background + fg-disabled text

## Prohibited

- No raw hex/rgb values in component code — always use design tokens
- No brand text color for long-form paragraphs
- No accent text tokens (fg-purple, etc.) for body copy or navigation
- No brand/accent backgrounds for large layout surfaces (pages, sections) unless it's a hero/campaign area
- No alternating background colors between adjacent sections — single surface color across the page
- No introducing a second saturated accent — terracotta is the sole interaction driver
- No manual light/dark value swapping — let the token system handle it

---

## Source file: `content.md`

# Content & Grid System

> Dependencies: `layout.md`, `typography.md`

## Containers

| Type | Max width | Horizontal padding |
|---|---|---|
| Standard | 1280px | 24px |
| Internal (reading) | 720px | — (60–75 char line length, optimized for long-form serif headlines + sans body) |

## Vertical Padding

| Breakpoint | Vertical padding |
|---|---|
| Mobile | 48px |
| Tablet (≥768px) | 64px |
| Desktop (≥1024px) | 96px for hero/feature sections, 80px otherwise |

## Grid System

Mobile-first with flexible desktop configurations.

| Context | Gap |
|---|---|
| Standard content/cards | 32px |
| Compact widgets/metadata | 16px |

### Responsive Columns

| Breakpoint | Columns |
|---|---|
| Mobile (default) | 1–2 |
| Small/Tablet (≥640px) | 2–4 |
| Desktop (≥1024px) | 3–12 |

Full support for 6, 7, 8, 9+ column grids where needed.

## Breakpoints

| Name | Width |
|---|---|
| Small | 640px |
| Medium | 768px |
| Large | 1024px |
| Extra large | 1280px |
| 2x Extra large | 1536px |

## Rules

- Always design mobile-first
- Use layout shifts (column → row) to accommodate horizontal space
- Lists: 24px indentation, 8px vertical gap between items
- Body copy: DM Sans, 17px, 1.7 line-height — generous for long-form reading
- Headings: DM Serif Display
- All interactive links follow brand underline/hover protocol
- Reading-width containers (720px) for any long-form / editorial content

---

## Source file: `dropdown.md`

# Dropdown

> Dependencies: `colors.md`, `radius.md`, `shadows.md`, `inputs.md`

## Core Specs

### Chevron Icon
- Size: 16x16px
- Spacing: 6px left margin, -2px right margin
- Color: inherits from trigger button

### Menu Container
- Background: neutral-tertiary
- Border: 1px, border-default
- Radius: 16px (base)
- Shadow: shadow-lg
- Z-index: elevated above content

### Menu List
- Padding: 8px
- Font: DM Sans, 14px, body color, medium weight

### Menu Item
- Layout: inline-flex, vertically centered, full width
- Padding: 8px horizontal, 8px vertical
- Radius: 8px (default)
- Hover: neutral-tertiary-medium background, heading text
- Transition: colors, 200ms

## Trigger Sizes

| Size | Font size | Horizontal padding | Vertical padding |
|---|---|---|---|
| Small | 14px | 14px | 8px |
| Base | 15px | 18px | 10px |
| Large | 16px | 22px | 12px |

## Icon-only Trigger

- Padding: 8px
- Min size: 44x44px
- Icon: 20x20px

## Variants

### Default
- Menu width: 176px, items have 8px radius

### With Divider
- Top border (border-default) between child groups, skip first group

### With Header
- Header padding: 16px horizontal, 12px vertical
- Bottom border: border-default
- Name: heading color, 14px, medium weight (DM Sans)
- Email: body-subtle color, 14px, truncated

### With Icons
- Icon before label: 16x16px, 8px right margin, body color
- On hover, icon color changes to heading

### With Checkbox / Radio
- Inputs: 16x16px, 4px radius, focus ring in brand-softer
- Helper text: 12px, body-subtle color, 2px top margin

### With Search
- Search input at top of menu following `inputs.md` specs
- Left icon: 12px left padding, input 36px left padding

### Scrollable
- Max height: 192px, vertical scroll overflow

## States

| State | Appearance |
|---|---|
| Focused trigger | no outline, 2px brand ring |
| Hover item | neutral-tertiary-medium background, heading text |
| Active/open item | neutral-tertiary-soft background, heading text |
| Disabled item | fg-disabled text, not-allowed cursor, no pointer events |

---

## Source file: `icon-shapes.md`

# Icon Shapes

> Dependencies: `colors.md`, `radius.md`

## Core Specs

- Box sizing: border-box
- Icon must be perfectly centered (inline-flex, centered both axes)
- Circle: fully rounded (9999px)
- Rounded square: 16px radius (MD/LG/XL), 8px radius (XS/SM)

## Sizes

| Size | Container | Icon |
|---|---|---|
| XS | 24x24px | 14x14px |
| SM | 32x32px | 16x16px |
| MD | 40x40px | 20x20px |
| LG | 48x48px | 24x24px |
| XL | 56x56px | 28x28px |

## Color Variants

### Brand
- Shape: circle
- Background: brand-softer
- Icon color: fg-brand-strong

### Gray
- Shape: circle
- Background: neutral-secondary-soft
- Icon color: body

### Danger
- Shape: circle
- Background: danger-soft
- Icon color: fg-danger-strong

### Success
- Shape: circle
- Background: success-soft
- Icon color: fg-success-strong

### Warning
- Shape: circle
- Background: warning-soft
- Icon color: fg-warning

---

## Source file: `inputs.md`

# Inputs

> Dependencies: `colors.md`, `radius.md`

## Core Specs

- **Display:** block, full width
- **Radius:** 16px (base)
- **Border:** 1px, border-default-medium
- **Background:** neutral-tertiary
- **Shadow:** shadow-xs
- **Font:** DM Sans, 15px, heading color
- **Padding:** 14px horizontal, 11px vertical
- **Placeholder:** body-subtle color
- **Transition:** all properties, 200ms

## Label

- Display: block
- Font: DM Sans, 14px, medium weight, heading color
- Margin bottom: 8px
- Label `htmlFor` must match the input `id`

## States

### Default
- Border: border-default-medium
- Background: neutral-tertiary

### Hover
- Border: border-default-strong

### Focus
- No outline
- Border: border-brand
- Ring: 1px, brand color

### Success
- Border: border-success
- Focus ring: 1px, success color

### Error / Danger
- Border: border-danger
- Focus ring: 1px, danger color

### Disabled
- Background: disabled
- Text: fg-disabled
- Cursor: not-allowed

## Input with Icons

- Icon size: 16x16px
- Icon color: body
- Container: relative positioned wrapper
- Start icon: absolutely positioned left, 12px left padding — input gets 36px left padding
- End icon: absolutely positioned right, 12px right padding — input gets 36px right padding
- Icons vertically centered within the wrapper

## Rules

- Every input must have a unique `id`
- Every label must have a matching `htmlFor`
- Padding: 14px horizontal, 11px vertical unless overridden for icon variants
- No arbitrary hex or hardcoded colors
- Inputs sit on the warmer card cream (neutral-tertiary) so they're clearly readable on the page surface

---

## Source file: `layout.md`

# Layout & Spacing

## Spacing Rhythm

Base unit: **8px**. All spacing values should be multiples of 8px.

| Context | Value |
|---|---|
| Section vertical padding | 96px |
| Section header → content | 48px or 64px |
| Heading → paragraph | 16px |
| Container horizontal padding | 24px |
| Flex/grid row gap | 16px |
| Card grid gap | 32px |
| Wide component grid gap | 32px |
| Column layout gap | 48px |

## Container

Standard section container: max-width 1152px, centered, 24px horizontal padding.

Every major section wraps content in this container.

## Content Composition Order

Inside each section, follow this order:
1. Heading (`h1`–`h3`) set in the display serif
2. Leading paragraph (DM Sans, generous line-height)
3. Normal paragraph(s)
4. Lists, CTA links, or component grids

## Section Pattern

Each section has:
- 96px vertical padding
- The single page surface background (neutral-primary-soft) — sections do NOT alternate background colors
- A centered container (max-width 1152px, 24px horizontal padding)
- A section header area with 48px bottom margin
- Section content below

The visual rhythm between sections comes from typography, cards, generous whitespace, and the warm cream surface — not from background contrast.

## Motion & Animation

- Prefer CSS-native: `transition`, `animation`, `keyframes`. Use a motion library only when CSS cannot achieve the behavior.
- Prioritize calm, slow motion in line with the editorial aesthetic — 200–400ms eases, no bouncy or aggressive motion.
- Reserve scroll-triggered and hover transitions for moments that reinforce hierarchy or reward attention.

## Backgrounds & Visual Depth

- The page is intentionally flat in surface color — depth comes from cards (warmer cream), borders (parchment), and subtle shadows.
- Avoid decorative gradient meshes, noise textures, or heavy patterns on backgrounds — the warmth of the palette is the texture.
- Gradients are reserved for buttons (top-left lighter → bottom-right darker), never for sections or cards.
- Every decorative element must serve a compositional purpose (depth, separation, or emphasis).

## Must

- All sections: consistent 96px vertical padding
- All sections: identical surface background — never alternate
- All containers: max-width 1152px, centered, 24px horizontal padding
- Section headers: 48px or 64px bottom margin
- Consistent vertical rhythm, generous whitespace — negative space is a feature
- Layouts readable and properly spaced on both desktop and mobile

---

## Source file: `lists.md`

# Lists

> Dependencies: `colors.md`

## Core Specs

- Item spacing: 16px vertical gap between list items
- Text: DM Sans, body color

## List Icons

- Size: 20x20px
- Prevent squishing: no shrink
- Spacing: 8px right margin between icon and text
- Active/featured icon: fg-brand color (terracotta)
- Neutral icon: body-subtle color

## Inactive / Disabled Items

Strikethrough text with body color decoration on the list item.

## Pattern

Vertical flex list with 16px gap. Each item is a flex row with centered alignment — icon (20x20, no-shrink, 8px right margin) followed by a span of body-colored DM Sans text.

---

## Source file: `modals.md`

# Modals

> Dependencies: `colors.md`, `radius.md`, `shadows.md`, `buttons.md`, `inputs.md`

## Core Specs

### Overlay (Backdrop)
- Fixed, covers full screen
- Z-index: 40
- Background: warm ink (#2B1D14) at 55% opacity
- Backdrop blur: small amount

### Content Container
- Background: neutral-tertiary
- Radius: 16px (base)
- Shadow: shadow-xl
- Padding: 24px

## Anatomy

### Header
- Bottom border: border-default
- Top corners rounded (16px)
- Title: DM Serif Display, 24px, regular weight (400), heading color
- Close button: Ghost variant from `buttons.md`, 6px padding

### Body
- Vertical padding: 24px
- Vertical spacing between elements: 24px
- Text: DM Sans, 16px, 1.7 line-height, body color

### Footer
- Top border: border-default
- Bottom corners rounded (16px)

## Variants

### Default (Information)
Standard header + body + footer with primary/secondary action buttons.

### Pop-up (Confirmation)
Centered text, prominent icon, reduced padding:
- Body: 24px padding, text centered
- Icon: centered, 16px bottom margin, 48x48px, body-subtle color

### Form Modal
Body contains inputs following `inputs.md`. Vertical spacing between form elements: 16px.

## Rules

- Backdrop covers full screen with fixed positioning
- Content: neutral-tertiary background (the card cream), 16px radius, shadow-xl
- Header/Footer separated by border-default borders
- Close button must be present and functional
- Accessibility: `role="dialog"`, implement focus trap in code
- Dark mode automatic via token system

---

## Source file: `pagination.md`

# Pagination

> Dependencies: `colors.md`, `radius.md`

## Container

Font: DM Sans, 14px. Items displayed as flex with -1px overlap for seamless borders.

## Pagination Item

- Layout: flex, centered both axes
- Size: 40x40px
- Text: body color, medium weight
- Background: neutral-tertiary
- Border: 1px, border-default-medium
- Hover: neutral-tertiary-medium background, heading text
- Focus: no outline
- Overlap: -1px left margin

## Previous / Next Buttons

- Horizontal padding: 14px, height: 40px
- First item: 16px radius on inline-start side
- Last item: 16px radius on inline-end side

## Active Page Item

- Text: white
- Background: brand
- Hover text: white (stays same)

## Rules

- Display as flex with -1px child overlap for seamless borders
- Items: neutral-tertiary background, border-default-medium border, body text
- Active: white text on brand background — terracotta marks the current page
- First item: rounded start (16px), Last item: rounded end (16px)
- All items need hover and focus states

---

## Source file: `radios-checkboxes-toggle.md`

# Radios, Checkboxes & Toggles

> Dependencies: `colors.md`, `radius.md`

## Checkbox

- Size: 16x16px
- Radius: 4px
- Border: 1px, border-default-medium
- Background: neutral-tertiary
- Focus ring: 2px, brand-softer
- Checked: brand background, white check icon

### Disabled
- Border: border-light
- Text: fg-disabled

## Radio

- Size: 16x16px
- Radius: fully rounded
- Border: 1px, border-default-medium
- Background: neutral-tertiary
- Focus ring: 2px, brand-softer
- Checked: border-brand, indicator dot: brand color

### Disabled
- Border: border-light-medium
- Text: fg-disabled

Group all radio items under the same `name` attribute.

## Toggle

### Track
- Fully rounded
- Background: neutral-quaternary
- Focus-within ring: 2px, brand-softer
- Checked track: brand background (terracotta)
- Disabled track: neutral-tertiary background

### Thumb
- Fully rounded
- Background: white
- Border: border-buffer

### Disabled
- Track: neutral-tertiary background
- Label: fg-disabled text

## Rules

- All selection inputs must have `id` matching label `htmlFor`
- Focus states use the appropriate brand token for each control type
- Disabled states: no hover/focus interaction

---

## Source file: `radius.md`

# Border Radius

| Token | Value | Default usage |
|---|---|---|
| base | 16px | Buttons, cards, inputs, modals, sections, navbar, sidebars, tabs, popovers |
| default | 8px | Badges, tooltips, dropdown items, small controls |
| sm | 4px | Checkboxes, tiny elements |
| full | 9999px | Pills, avatars, toggles, dot indicators |

## Rules

- 16px is the default radius across the product — every primary surface (cards, buttons, inputs, modals, panels) uses it
- Never use arbitrary radius values outside this scale
- Radius must be consistent within each component family
- Soft corners reinforce the warm, human aesthetic — never use sharp 0px corners on primary surfaces

---

## Source file: `shadows.md`

# Shadows

Shadows use a warm, brown-tinted base (rather than pure black) so elevations sit naturally on the cream surface.

| Token | Value |
|---|---|
| shadow-2xs | `0 1px rgb(43 29 20 / 0.04)` |
| shadow-xs | `0 1px 2px 0 rgb(43 29 20 / 0.05)` |
| shadow-sm | `0 1px 3px 0 rgb(43 29 20 / 0.08), 0 1px 2px -1px rgb(43 29 20 / 0.06)` |
| shadow-md | `0 4px 8px -2px rgb(43 29 20 / 0.08), 0 2px 4px -2px rgb(43 29 20 / 0.06)` |
| shadow-lg | `0 10px 20px -4px rgb(43 29 20 / 0.10), 0 4px 8px -4px rgb(43 29 20 / 0.06)` |
| shadow-xl | `0 20px 30px -8px rgb(43 29 20 / 0.12), 0 8px 12px -6px rgb(43 29 20 / 0.08)` |
| shadow-2xl | `0 28px 56px -16px rgb(43 29 20 / 0.22)` |

## Component Mapping

| Component type | Token |
|---|---|
| Subtle separators, tiny UI details | shadow-2xs or shadow-xs |
| Inputs, buttons, small controls, lightweight cards | shadow-xs or shadow-sm |
| Standard cards, popovers, dropdowns | shadow-sm or shadow-md |
| Prominent cards, sticky surfaces | shadow-md or shadow-lg |
| Modals, high-priority overlays | shadow-xl |
| Hero overlays, top-level emphasis (sparingly) | shadow-2xl |

## Rules

- Use only these tokens — no custom box-shadow values
- Keep elevation steps intentional; avoid jumping multiple levels
- Components in the same family share the same baseline elevation
- Hover/focus on interactive elevated elements: step up by one level
- Never stack multiple shadow tokens on one element
- Never use shadow-xl/shadow-2xl for dense list items or body containers
- Shadows are warm and soft — never use cold, hard, or neon-style shadows

---

## Source file: `sidebars.md`

# Sidebars

> Dependencies: `colors.md`, `radius.md`, `typography.md`, `badges.md`, `alerts.md`

## Core Specs

- Background: neutral-tertiary (warmer card cream — sets the sidebar apart from the page surface)
- Right border: 1px, border-default (for left-sidebar); left border for right-sidebar
- Width: 256px

## Anatomy

### Outer Container
Hidden on mobile, visible at small breakpoint. Needs a toggle/trigger for mobile.

### Inner Wrapper
- Full height, vertical scroll overflow
- Padding: 12px horizontal, 16px vertical

### Navigation List
- Vertical spacing: 8px between items
- Font: DM Sans, medium weight

### Navigation Item
- Layout: flex, vertically centered
- Padding: 10px horizontal, 10px vertical
- Text: heading color
- Radius: 16px (base)
- Hover: neutral-tertiary-medium background
- Transition: colors, 200ms
- Icon: 20x20px, body color, hover → heading color, 150ms transition
- Label: 12px left margin from icon

### Active Item
- Background: brand-softer
- Text: fg-brand-strong
- Optional: 2px brand left-edge accent for stronger emphasis

### Separator
- 16px top padding, 16px top margin
- Top border: border-default
- 8px vertical spacing below

### Bottom CTA / Card
- Padding: 16px
- Top margin: 24px
- Radius: 16px (base)
- Background: brand-softer
- Can also use any alert variant from `alerts.md`

## Rules

- Responsive: hidden on mobile with a trigger mechanism
- Icons: 20x20px, body color (hover: heading color)
- Multi-level menus: indent with 44px left padding
- Spacing follows 8px grid
- Only neutral, brand, or status tokens — no arbitrary colors

---

## Source file: `tables.md`

# Tables

> Dependencies: `colors.md`, `radius.md`, `shadows.md`

## Wrapper

- Horizontal scroll overflow
- Background: neutral-tertiary
- Radius: 16px (base)
- Border: 1px, border-default
- Shadow: shadow-xs

## Table Element

- Full width, left-aligned text (right-aligned for RTL)
- Font: DM Sans, 14px, body color

## Table Head

- Font: DM Sans, 13px, body-subtle color, medium weight, uppercase, 0.05em letter-spacing
- Background: neutral-tertiary-medium
- Bottom border: border-default
- Cell padding: 24px horizontal, 14px vertical

## Table Body

- Row background: neutral-tertiary
- Row bottom border: border-default (omit on last row to avoid doubling with wrapper border)
- Row hover: neutral-tertiary-medium background (optional)
- Row header: medium weight, heading color, no-wrap
- Cell padding: 24px horizontal, 16px vertical

## Rules

- Wrapper must have horizontal scroll overflow for responsive scrolling
- Last row: omit bottom border to avoid doubling with wrapper border
- Row headers: always `scope="row"` for semantic structure
- Hover on rows is optional
- No arbitrary hex codes — use token colors only

---

## Source file: `tabs.md`

# Tabs

> Dependencies: `colors.md`, `radius.md`, `shadows.md`

## Core Specs

- Typography: DM Sans, 15px, medium weight, body color
- Transitions: all properties, 200ms

## Variants

### 1. Underline (Default)

**Wrapper:** bottom border, border-default

**Tab Item:**
- Padding: 16px horizontal, 16px vertical
- Bottom border: 2px, transparent
- Top corners: 16px radius
- Transition: colors, 200ms

| State | Appearance |
|---|---|
| Active | fg-brand text, border-brand bottom border |
| Inactive | transparent bottom border; hover → heading text, border-default-strong bottom border |
| Disabled | fg-disabled text, not-allowed cursor |

### 2. Pills

**Tab Item:**
- Padding: 18px horizontal, 10px vertical
- Radius: 16px (base)
- Font weight: medium
- Transition: all, 200ms

| State | Appearance |
|---|---|
| Active | `linear-gradient(to bottom right, brand, brand-strong)` background, white text, shadow-sm |
| Inactive | body text; hover → neutral-tertiary-medium background, heading text |
| Disabled | fg-disabled text, not-allowed cursor |

### 3. Full Width

Children overlap with -1px left margin on all except first.

**Tab Item:**
- Full width, centered text
- Padding: 16px horizontal, 16px vertical
- Background: neutral-tertiary
- Border: 1px, border-default
- Transition: colors, 200ms
- Hover: neutral-tertiary-medium background, heading text

| State | Appearance |
|---|---|
| Active | neutral-tertiary-medium background, fg-brand text |
| First item | rounded start (16px) |
| Last item | rounded end (16px) |

## Tabs with Icons

- Icon size: 16x16px or 20x20px
- Spacing: 8px right margin
- Layout: inline-flex, centered
- Icons inherit the text color of the tab state

---

## Source file: `tooltips-popovers.md`

# Tooltips & Popovers

> Dependencies: `colors.md`, `radius.md`, `shadows.md`

## Tooltips

### Core Specs
- Padding: 12px horizontal, 8px vertical
- Font: DM Sans, 13px, medium weight
- Radius: 8px (default)
- Shadow: shadow-sm
- Transition: opacity, 200ms

### Dark (Default)
- Background: dark (warm ink)
- Text: white
- Border: transparent

### Light
- Background: neutral-tertiary
- Text: heading color
- Border: 1px, border-default

## Popovers

### Core Specs
- Background: neutral-tertiary
- Radius: 16px (base)
- Shadow: shadow-md
- Border: 1px, border-default
- Transition: opacity, 200ms

### Header / Title
- Padding: 14px horizontal, 10px vertical
- Background: neutral-tertiary-medium
- Bottom border: border-default
- Font: DM Sans, 14px, medium weight, heading color

### Body / Content
- Standard: 14px horizontal, 10px vertical padding; DM Sans, 14px, body color
- Rich: 16px padding; DM Sans, 14px, body color

## Arrows

- Size: 8x8px rotated 45deg
- Color must match the background of the tooltip/popover variant

## Rules

- Tooltips: 8px radius (small inline UI hint)
- Popovers: 16px radius (matches the surface system)
- Dark tooltips: warm-ink background, white text
- Light tooltips/popovers: semantic neutral background + border tokens
- Arrows match parent background color

---

## Source file: `typography.md`

# Typography

> Dependencies: `colors.md`

## Core Rules

- **Heading font:** DM Serif Display, serif — used for `h1`–`h6` and any display text
- **Body / UI font:** DM Sans, sans-serif — used for paragraphs, buttons, labels, inputs, navigation, and every non-heading element
- **Headings:** regular weight (400), heading text color, slight negative letter-spacing for the largest sizes
- **Body copy:** body text color, never use brand color for paragraphs longer than one sentence
- **Semantic HTML:** Use `h1`–`h6` in order, never skip levels

## Heading Scale

### Desktop

| Element | Size | Line-height | Letter-spacing | Margin-bottom |
|---|---|---|---|---|
| `h1` | 60px | 1.05 | -0.9px | 24px |
| `h2` | 44px | 1.15 | -0.5px | — |
| `h3` | 36px | 1.2 | -0.3px | — |
| `h4` | 30px | 1.25 | -0.2px | — |
| `h5` | 24px | 1.3 | — | — |
| `h6` | 20px | 1.35 | — | — |

### Responsive

| Element | Tablet (≥768px) | Mobile (default) |
|---|---|---|
| `h1` | 44px | 36px |
| `h2` | 36px | 30px |
| `h3` | 30px | 26px |
| `h4` | 26px | 22px |
| `h5` | 22px | 20px |
| `h6` | 18px | 18px |

Mobile-first: start with mobile sizes, scale up at tablet and desktop breakpoints.

Never reduce line-height below 1.05 for any heading.

## Paragraphs

### Leading Paragraph
- Font: DM Sans
- Size: 20px
- Weight: normal
- Color: body
- Line-height: 1.7
- Max width: ~70 characters

### Normal Paragraph
- Font: DM Sans
- Size: 17px
- Weight: normal
- Color: body
- Line-height: 1.7
- Max width: ~65 characters

### Small Supporting Copy
- Font: DM Sans
- Size: 14px
- Weight: normal
- Color: body-subtle
- Line-height: 1.6
- Use only for helper text, legal text, captions, metadata.

## UI Labels

| Context | Size | Weight |
|---|---|---|
| Button labels | 15px | 500 (medium) |
| Input labels | 14px or 16px | 500 (medium) |
| Captions / meta / badges | 12px or 14px | 500 (medium) |
| Eyebrow / overline label | 12px | 500, uppercase, 0.1em letter-spacing |

UI labels use DM Sans. Do not apply paragraph line-height (1.7) to control labels.

## Links

- **Inline links:** Same size as surrounding text, fg-brand color, underline (offset 2–3px), hover → no underline
- **CTA links:** fg-brand color, medium weight, underline, hover → no underline

## Emphasis

- `<strong>` for high-priority emphasis in body text
- `<em>` rendered with the heading serif italic for tone emphasis only, not visual hierarchy
- All-caps only for short labels: uppercase, 0.1em letter-spacing, 12px or 14px

## Dark Mode

Hierarchy stays identical. Only color tokens change (automatic via the token system). Font, size, weight, and spacing remain constant.

