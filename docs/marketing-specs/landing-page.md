# Feature request: turn the web root into a conversion landing page

**From:** Marketing · **Priority:** HIGH for loud launch (Wed Aug 27) — every video caption, Reddit post, PH link, and press pitch points here or to the App Store; logged-out visitors currently hit an app shell, not a pitch.

## Requirement

`https://recipe-vault-mh.netlify.app/` for a **logged-out visitor** renders a marketing page. Existing users: prominent "Open the web app" nav link → current app (logged-in users can auto-redirect straight to the app).

## Page spec (top to bottom)

1. **Hero:** "Share a reel. Get the recipe." + one subline ("Dilla writes down the recipes you save on TikTok, Instagram, Pinterest — even when they're only spoken in the video.") + **App Store badge** + a 15-sec autoplaying muted loop (marketing supplies the file — it's video #1 cut down).
2. **Three pillar blocks** (copy supplied, matches PLAN §1): It writes it down · You never leave your scroll · Saved ≠ cooked.
3. **Honest pricing section:** Free 20 imports/mo (5 video) · Pro $4.99/mo or $29.99/yr, 200/mo (40 video) · no ads, no tracking, delete your account anytime.
4. **Creator note (one line + link):** "Every recipe keeps its creator's name and a link back. Creators: [contact]."
5. **FAQ (5 items, copy supplied on request):** how it works, spoken-only videos, "recipe in bio" posts, privacy, web vs iPhone.
6. **Email capture:** single field, "Get launch updates." Netlify Forms is fine. No popup, no gate.
7. **Footer:** /privacy · /support · App Store link.

## Technical asks

- **Smart banner:** `<meta name="apple-itunes-app" content="app-id=APP_ID">` on all web pages once the app ID exists (A-day task).
- **SEO:** title "Dilla — Save recipes from TikTok, Instagram & Pinterest, written out properly"; meta description supplied; OG/Twitter card image (marketing supplies, espresso-gradient brand frame); routes reserved for two article pages coming week 3 (`/save-recipes-from-tiktok`, `/recipe-from-instagram-reel`).
- Visual language = the App Store screenshot system: cream/paper/espresso, paprika accent, Fraunces + Inter. No new design language.

## Language guardrails (verbatim, non-negotiable)

Copy says Dilla *gets the recipe / writes the recipe down*. The words "download," "save videos/reels," "rip" must not appear anywhere on the page, including alt text and meta tags. Platform names appear factually only ("works with posts from…"), no platform logos.
