# Travel App — Design Style Guide

## Overview

A warm, nature-inspired travel planner. The visual language uses earthy tones (cream, olive green, golden yellow) to feel organic and approachable — not corporate. Cards are clean white on a warm cream background. Corners are generously rounded. Shadows are soft, never harsh.

---

## Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `primary` | `#7C9A6B` | Buttons, active states, key UI elements |
| `primaryDark` | `#5A7A4A` | Header backgrounds, pressed states |
| `primaryLight` | `#A8C08A` | Light tints, selected chip backgrounds |
| `accent` | `#D4A853` | Highlights, owner badge, warning |
| `accentLight` | `#F0C878` | Subtle accent tints |
| `background` | `#F5F2EC` | Screen background (warm cream) |
| `card` | `#FFFFFF` | Card surfaces, modals, inputs |
| `border` | `#E0D8C8` | Dividers, input borders |
| `text` | `#2C2C2C` | Primary text |
| `textSecondary` | `#888888` | Labels, captions, hints |
| `textLight` | `#AAAAAA` | Placeholders, disabled states |
| `danger` | `#E05A5A` | Delete, error states |
| `success` | `#5AAD6B` | Confirmed, success states |
| `info` | `#5A8AAD` | Info badges, links |
| `shadow` | `rgba(0,0,0,0.08)` | Card shadow color |

---

## Typography

| Use | Size | Weight | Color |
|-----|------|--------|-------|
| Screen title | 24–26px | 700 | `text` |
| Section title | 17–20px | 600–700 | `text` |
| Card title | 15–16px | 600 | `text` |
| Body text | 15px | 400 | `text` |
| Label / field name | 13px | 500 | `textSecondary` |
| Caption / hint | 11–12px | 400 | `textSecondary` or `textLight` |
| Amount / number | 15–36px | 600–700 | varies |

Font family: system default (no custom font).

---

## Spacing & Layout

| Token | Value | Usage |
|-------|-------|-------|
| Screen padding | 16–20px | Horizontal margin from screen edge |
| Card padding | 16px | Internal card padding |
| Modal padding | 24px | Internal modal scroll padding |
| Section gap | 16px | Between sections |
| Item gap | 8–12px | Between sibling elements |

---

## Border Radius

| Component | Radius |
|-----------|--------|
| Text input | 12px |
| Card | 16px |
| Chip / tag | 20px (pill) |
| FAB | 28px (circle) |
| Modal bottom sheet | 24px top corners only |
| Small badge | 6–8px |
| Icon box | 12px |
| Avatar circle | 50% |

---

## Elevation / Shadow

Standard card shadow:
```
shadowColor: '#000'
shadowOpacity: 0.06–0.08
shadowRadius: 6–8
shadowOffset: { width: 0, height: 2 }
elevation: 2–3  (Android)
```

---

## Components

### Screen Header
- Full-width, `primaryDark` background (`#5A7A4A`)
- White text (title 18–20px bold, subtitle 12–13px semi-transparent white)
- Back button: Ionicons `chevron-back`, white, left side

### Card
```
backgroundColor: #FFFFFF
borderRadius: 16
padding: 16
shadow: standard
marginBottom: 12–14
```

### Primary Button
```
backgroundColor: primary (#7C9A6B)
height: 50
borderRadius: 14
text: white, 16px, weight 600
```

### Cancel Button
```
backgroundColor: background (#F5F2EC)
borderWidth: 1, borderColor: border (#E0D8C8)
height: 50
borderRadius: 14
text: textSecondary, 16px
```

### Danger Button
```
backgroundColor: #FEE2E2
text: danger (#E05A5A), 12–14px
borderRadius: 8
```

### Text Input
```
height: 46
backgroundColor: background (#F5F2EC)
borderRadius: 12
paddingHorizontal: 14
fontSize: 15
color: text (#2C2C2C)
borderWidth: 1, borderColor: border (#E0D8C8)
```

### FAB (Floating Action Button)
```
position: absolute, bottom: 80, right: 24  (above tab bar)
width/height: 56, borderRadius: 28
backgroundColor: primary (#7C9A6B)
icon: Ionicons "add", white, size 28
```

### Bottom Sheet Modal
```
overlay: rgba(0,0,0,0.4)
slide up animation
borderTopLeftRadius: 24, borderTopRightRadius: 24
backgroundColor: card (#FFFFFF)
maxHeight: ~92% of screen height
internal ScrollView with padding: 24
```

### Chip / Tag
```
flexDirection: row, alignItems: center, gap: 4
paddingHorizontal: 12, paddingVertical: 8
borderRadius: 20
default: backgroundColor background, borderColor border
selected: backgroundColor primary, borderColor primary, text white
```

### Tab Bar (bottom navigation)
```
backgroundColor: #FFFFFF
border top: #E0D8C8
active icon/label: primary (#7C9A6B)
inactive: textLight (#AAAAAA)
```

### Day Selector (horizontal scroll pills)
```
unselected: backgroundColor background, text textSecondary
selected: backgroundColor primary, text white, fontWeight 700
borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8
```

---

## Icon Library

Uses **@expo/vector-icons — Ionicons** throughout.
Common icons:
- Back: `chevron-back`
- Add: `add`
- Edit: `pencil-outline`
- Delete: `trash-outline`
- Airplane: `airplane`
- Calculator: `calculator-outline`
- Checkmark: `checkmark-circle`
- Close: `close-circle-outline`

---

## Emoji Usage

Emojis are used extensively as visual anchors:
- Trip type icons (✈️ 🚗 🗺️)
- Category icons for expenses and itinerary items
- Member avatars (😀 👨 👩 👑)
- Weather conditions
- Section markers and empty states

---

## Empty States
```
centered layout, marginTop: 60–80
large emoji: fontSize 48–60
title: 16–18px, weight 600, color text
subtitle: 14px, color textSecondary, marginTop: 6
```

---

## Design Principles

1. **Warm, not sterile** — cream background instead of pure white; olive green instead of corporate blue
2. **Rounded, friendly** — generous border radii throughout; no sharp corners
3. **Cards on canvas** — white cards float on the cream background with soft shadows
4. **Emoji as icons** — lightweight, expressive, no icon packs needed for content
5. **Green = action** — primary color is consistently used for all primary actions and active states
6. **Golden = special** — accent color marks owner status, highlights, and badges
