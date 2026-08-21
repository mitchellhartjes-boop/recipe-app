# Data-retention audit — what Dilla keeps from an imported post

Code audit, 2026-08-21, requested by the marketing session before any 5.2.2/5.2.3
response packet is written. **Nothing here may be asserted to App Review, in the
privacy policy, or in marketing copy unless this document supports it.**

## (i) Raw transcript — NOT persisted ✅

Verified in code:

- `worker/lib/video.mjs` `processVideoFile()` returns `{ recipe, transcript, … }`,
  but `worker/index.mjs` deliberately does not bind `transcript` — only
  `{ recipe, imageUrl, author }` reach anything downstream.
- `extraction_meta` (worker/index.mjs `toRecord`) = `{ source_kind, confidence,
  recovered_notes }`. No transcript, no frames, no raw text dump.
- No worker code path logs the transcript. (`scripts/test-video.mjs` prints it,
  but that is a local developer script and never runs in CI or production.)
- Job error payloads (`recipe_jobs.error`, capped at 500 chars) can contain:
  Groq's own HTTP error body, Apify failure text, or up to 200 chars of Claude's
  *output* when the recipe JSON fails to parse. None of these are the transcript.

**Precise claim we can make:** the transcript exists only in memory for the
duration of the extraction and is never written to our database, storage, logs,
or job records.

**Nuance to keep honest:** the transcript and sampled frames ARE transmitted to
our processing providers (Groq for speech-to-text, Anthropic for extraction) as
API request payloads. "We do not retain it" is true; "it never leaves our
server" would be false. Say the former.

## (ii) Media files — NOT retained, with ONE deliberate exception ⚠️

**Video, audio, and sampled frames:** written to a per-job temp directory on the
ephemeral cloud runner, never uploaded to our storage or database. As of
2026-08-21 the worker also deletes that directory in a `finally` block
immediately after extraction (success or failure), so deletion is guaranteed by
our code rather than as a side effect of the runner being destroyed.

**THE EXCEPTION — one static cover image IS retained permanently.**
`rehostImage()` (netlify/functions/_lib/images.mjs) downloads the post's preview
thumbnail — the same image the platform serves for link embeds — and uploads it
to the public `recipe-images` Supabase bucket with a 1-year cache header. It is
served to the user as the recipe card's picture.

**This means the blanket statement "no media file is retained" is FALSE and must
never be sent to Apple or published.** The accurate version, already used in the
Aug 14 reply to App Review:

> …a single static thumbnail image (the same cover image the platform itself
> serves for link previews) used to identify the recipe visually in the user's
> library.

## Summary — what survives one import

| Artifact | Retained? | Where |
|---|---|---|
| Extracted recipe text (title, ingredients, steps) | Yes | `recipe_recipes` |
| Creator attribution + source URL | Yes | `recipe_recipes` |
| Static cover thumbnail | **Yes** | Supabase Storage (public bucket) |
| Raw transcript | No | memory only, sent to Groq/Anthropic |
| Video file / extracted audio / frames | No | temp dir, deleted in `finally` |
| Any playable media served to users | No — no such capability exists | — |
