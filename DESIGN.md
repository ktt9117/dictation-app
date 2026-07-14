---
version: "alpha"
name: "Voxel Gamified Isometric"
description: "Voxel landing page, isometric 3d style, gamified design, floating islands, blocky characters, colorful and friendly. Ideal for landing pages, modern websites. AI-ready template."
colors:
  primary: "#E8F0FE"
  secondary: "#5D4037"
  tertiary: "#69F0AE"
  neutral: "#448AFF"
  surface: "#66BB6A"
  accent: "#FF7043"
typography:
  h1:
    fontFamily: Nunito
    fontSize: 2.5rem
    fontWeight: 700
  body-md:
    fontFamily: Nunito
    fontSize: 1rem
    fontWeight: 400
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.neutral}"
    padding: 12px
---

## Overview

Voxel landing page, isometric 3d style, gamified design, floating islands, blocky characters, colorful and friendly. Ideal for landing pages, modern websites. AI-ready template. Voxel aesthetics didn't start with Minecraft. But Minecraft made them universal. Before 2011, isometric pixel art lived in niche communities — modding forums, indie dev circles, demoscene archives. Then a generation grew up placing blocks, and suddenly chunky 3D geometry wasn't retro nostalgia anymore. It was native visual language.

The crossover into UI happened gradually, then all at once. Gamification platforms needed visual systems that felt playful without being childish. Isometric voxel illustrations solved that tension perfectly — dimensional enough to feel substantial, stylized enough to avoid uncanny valley. Notion added game-like progress bars. Duolingo built entire worlds from flat isometric tiles. NFT projects in 2021-2022 leaned hard into voxel avatars because they rendered fast, looked distinctive at thumbnail scale, and carried instant community recognition.

What's interesting now: voxel-gamified design has matured past novelty. It's a legitimate system choice for products that need to communicate complexity through spatial metaphor — dashboards as cityscapes, data as terrain, progress as construction.

- Density: 5/10 — Balanced
- Variance: 7/10 — Dynamic
- Motion: 8/10 — Cinematic

- **Style:** Playful, Structured, Friendly
- **Keywords:** voxel, isometric, 3d, game, block, pixel, colorful, floating
- **Era:** Modern Gaming
- **Light/Dark:** ✓ Full / ✗ No

## Colors

- **Background** (#E8F0FE) — Primary background surface
- **Text** (#5D4037) — Primary text color
- **Accent** (#69F0AE) — Primary accent, CTAs and interactive elements
- **Cube Blue** (#448AFF) — Secondary accent
- **Grass Block** (#66BB6A) — Extended palette, decorative use
- **Lava Orange** (#FF7043) — Warm accent, call-to-action secondary


## Typography

- **Display / Hero:** Nunito — Weight 700, tight tracking, used for headline impact
- **Body:** Nunito — Weight 400, 16px/1.6 line-height, max 72ch per line
- **UI Labels / Captions:** Nunito — 0.875rem, weight 500, slight letter-spacing
- **Monospace:** JetBrains Mono — Used for code, metadata, and technical values

Scale:
- Hero: clamp(2.5rem, 5vw, 4rem)
- H1: 2.25rem
- H2: 1.5rem
- Body: 1rem / 1.6
- Small: 0.875rem


## Layout

- **Grid:** CSS Grid primary. Max-width containment: 1280px centered with 1.5rem side padding.
- **Spacing rhythm:** Balanced. Base unit: 0.5rem (8px).
- **Section vertical gaps:** clamp(4rem, 8vw, 8rem).
- **Hero layout:** Asymmetric composition.
- **Feature sections:** Asymmetric grid with varied card sizes. No 3-equal-columns.
- **Mobile collapse:** All multi-column layouts collapse below 768px. No horizontal overflow.
- **z-index contract:** base (0) / sticky-nav (100) / overlay (200) / modal (300) / toast (500).


## Elevation & Depth

Isometric projection, voxel-style block characters, floating island platforms, smooth vector gradients, edge lighting.

- **Physics:** Spring — stiffness 120, damping 20. Confident, weighted transitions.
- **Entry animations:** Fade + translate-Y (16px → 0) over 540ms ease-out. Staggered cascades for lists: 120ms between items.
- **Hover states:** Scale(1.03) + shadow lift over 200ms.
- **Page transitions:** Fade + slide (300ms).
- **Performance:** Only transform and opacity animated. No layout-triggering properties.


## Shapes

Base corner radius: 8px. See rounded tokens in front matter for the full scale.


## Components

- **Primary Button:** Subtly rounded (0.5rem) shape. Accent color fill. Hover: 8% darken + subtle lift shadow. Active: -1px translate tactile press. Font weight 600. No outer glows.
- **Secondary / Ghost Button:** Outline variant. 1.5px border in muted color. Text in primary color. Hover: subtle background fill.
- **Cards:** Subtly rounded (0.5rem) corners. Surface background. Subtle shadow (0 2px 12px rgba(0,0,0,0.06)). 1px border stroke.
- **Inputs:** Label above input. 1px border stroke. Focus ring: 2px accent color offset 2px. Error text below in semantic red. No floating labels.
- **Navigation:** Primary surface background. Active item: accent color indicator. Font weight 500 when active.
- **Skeletons:** Shimmer animation matching component dimensions. No circular spinners.
- **Empty States:** Icon-based composition with descriptive text and action button.


## Do's and Don'ts

- No emojis in UI — use icon system only (Lucide, Heroicons)
- No pure black (#000000) — use off-black or charcoal variants
- No oversaturated accent colors (saturation cap: 80%)
- No 3-column equal-width feature layouts — use zig-zag or asymmetric grid
- No `h-screen` — use `min-h-[100dvh]`
- No AI copywriting clichés: "Elevate", "Seamless", "Unleash", "Next-Gen"
- No broken external image links — use picsum.photos or inline SVG
- No generic lorem ipsum in demos

- Do Isometric layout/illustration
- Do Blocky 'Minecraft' style elements
- Do Bright cheerful colors
- Do Floating containers (shadows underneath)
- Do Gamified UI elements


## Use Case

Landing pages, Modern websites
