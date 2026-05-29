# iOS Shortcut — “Save to Recipe Vault” (share-to-app)

Share a reel from Instagram (or a recipe page from Safari/Pinterest) straight into your library
— no need to open the site. The Shortcut POSTs the shared link to the `submit` function, which
either **saves the recipe immediately** (Instagram caption / recipe website) or **queues a job**
for the worker (link-in-bio reels, video reels), then shows you a notification.

- **Endpoint:** `POST https://recipe-vault-mh.netlify.app/.netlify/functions/submit`
- **Auth:** header `Authorization: Bearer <SHORTCUT_TOKEN>` — the token is in `.env`
  (`SHORTCUT_TOKEN`) and set on the Netlify site. **It is a secret — do not commit it.**
- **Body:** JSON `{ "url": "<the shared link>" }` (the function also accepts a link buried in
  shared text, a raw-text body, or `?url=` / `?token=` query params).
- **Response:** JSON `{ ok, status, kind, recipe_id|job_id, message }`. Just show `message`.

---

## Build it on your iPhone (one time, ~2 min)

1. Open the **Shortcuts** app → tap **+** to create a new shortcut.
2. Tap the shortcut name at the top → **Rename** it `Save to Recipe Vault`.
3. Open the shortcut’s **Details** (the ⓘ / settings panel) → turn **Show in Share Sheet** ON.
   Under **Share Sheet Types**, leave **URLs** and **Text** enabled; turn the rest off.
4. Add action **Get Contents of URL** (search for it). Configure:
   - **URL:** `https://recipe-vault-mh.netlify.app/.netlify/functions/submit`
   - Tap **Show More**:
     - **Method:** `POST`
     - **Headers:** add one →
       - Key: `Authorization`
       - Value: `Bearer <YOUR_SHORTCUT_TOKEN>`  ← paste your real token here
     - **Request Body:** `JSON` → **Add new field** → type **Text**:
       - Key: `url`
       - Value: tap the value box → pick the **Shortcut Input** variable (the shared link)
5. Add action **Get Dictionary Value**:
   - Get **Value** for key `message` in **Contents of URL** (the result of step 4 — Shortcuts
     parses the JSON response into a dictionary automatically).
6. Add action **Show Notification** → set its text to the **Dictionary Value** from step 5.
7. Tap **Done**.

That’s it — this hand-built path is the reliable one.

> **Why not a ready-made `.shortcut` file?** Current iOS refuses to import unsigned shortcut files
> (“Importing unsigned shortcut files is not supported”) and there’s no setting to re-enable it.
> Making one importable requires **signing** it with the macOS Shortcuts CLI
> (`shortcuts sign -m anyone -i in.shortcut -o out.shortcut`), which needs a Mac. On a Windows-only
> setup, build it by hand as above. (`scripts/make-shortcut.mjs` can still emit the unsigned plist
> if you ever have a Mac to sign it on.)

## Use it

- **Instagram reel:** open the reel → tap **Share** (paper-plane) → **Share to…** →
  **Save to Recipe Vault**.
- **Recipe website / Pinterest pin:** in Safari or Pinterest tap **Share** → **Save to Recipe Vault**.
- You’ll get a notification:
  - *“Saved “…” to your library.”* — caption or website recipe, already in the library.
  - *“Queued — pulling the full recipe from the creator’s blog…”* — link-in-bio reel; the cloud
    worker finishes it in ~5 min.
  - *“Queued — the recipe is in the video…”* — video reel; it processes the next time your
    **local** worker runs (`$env:WORKER_KINDS='video'; node worker/index.mjs` — Instagram blocks
    video downloads from datacenter IPs, so video is local-only for now).

## Make the app feel native (optional)

Open https://recipe-vault-mh.netlify.app in **Safari** → **Share** → **Add to Home Screen**.
It installs as a PWA (full-screen, app icon), so the Shortcut drops recipes in and you browse them
in the “app.”

## Troubleshooting

| Notification | Cause / fix |
|---|---|
| `Unauthorized — check the token in your Shortcut.` | The `Authorization` header is wrong. It must be exactly `Bearer ` + your token, no quotes. |
| `No valid link was shared.` | The share didn’t include a URL. Use **Copy Link** in Instagram, then run the Shortcut on the copied link, or share again choosing the link. |
| `Couldn’t find a recipe at that link.` | A website with no detectable recipe. Add it manually in the app. |
| Nothing happens / network error | Check the function logs: `netlify` dashboard → Functions → `submit`. |

## Rotating the token

1. Generate a new one: `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`
2. Update it in `.env` (`SHORTCUT_TOKEN=…`) **and** on Netlify
   (`netlify env:set SHORTCUT_TOKEN <new> ` from the project folder), then redeploy.
3. Edit the `Authorization` header value in the Shortcut to the new token.
