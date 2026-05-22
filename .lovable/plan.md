# Community Landing — Light Theme Restyle

## Goal
Keep the current community landing structure (Hero + Features + Leagues + CTA) but switch it from the dark "gradient-hero" look to the **light background / dark text** look used by the Booking-only landing. Accent the brand wordmark **"EdgeCollective"** in a **light neon green**.

## Save current template
Snapshot existing files unchanged as backup before edits:
- `src/components/home/HeroSection.tsx` → `HeroSection.dark.tsx.bak`
- `src/components/home/CTASection.tsx` → `CTASection.dark.tsx.bak`

(Backups inside `src/components/home/_backup/` so they don't compile into the app.)

## Visual changes

### Tokens (index.css)
- Add `--neon-green: 96 80% 60%` (light neon green, HSL).
- Add utility `.text-neon-green { color: hsl(var(--neon-green)); }` (and a subtle text-shadow glow).

### HeroSection.tsx (community)
- Replace dark `bg-gradient-hero` wrapper + image overlay with the **light** treatment from `BookingHeroSection`:
  - `bg-background`, subtle primary/accent blurred orbs.
- Text: `text-foreground` (headline), `text-muted-foreground` (sub).
- Badge: light variant (`bg-primary/5 border-primary/10 text-foreground`).
- Wordmark: keep `<span className="text-neon-green">EdgeCollective</span>` (replaces `text-gradient-gold`).
- Buttons: primary "Book Now" uses default primary; "Join the Collective" + "Sign In" use `variant="outline"`.
- Feature pills: light card style (`bg-card border-border text-foreground`, icon in `text-primary`).
- Remove dark bottom wave (not needed on light bg).

### CTASection.tsx
- Swap dark `bg-gradient-hero` panel for a **light** card: `bg-card border border-border` (or soft `bg-muted/40`) with the same blurred orbs at low opacity.
- Headline `text-foreground`; "EdgeCollective?" span → `text-neon-green`.
- Sub copy → `text-muted-foreground`.
- Primary CTA: default primary button. Secondary: `variant="outline"`.

### Untouched
- `FeaturesSection`, `LeaguesLandingSection`, `Navbar`, `Footer` — already light-themed, no change.
- Booking-mode landing — no change.

## Out of scope
- No copy changes.
- No structural/layout changes beyond color/background.
- No changes to admin or member app theme tokens.
