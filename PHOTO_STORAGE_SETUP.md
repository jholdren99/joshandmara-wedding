# Connect the private wedding photo album to Cloudflare R2

This is prepared source, not an active storage migration. The current album remains in Supabase until the steps below are completed. On inspection it contained zero uploaded objects, so there were no existing photo files to migrate. Existing Supabase photo records remain readable after enabling R2; do not delete that bucket.

## What is changing

New uploads can go to a private R2 bucket in your Cloudflare account. Supabase continues to hold invitations, responses, sessions, captions and photo IDs. No new database tables, SQL migration, or Supabase plan upgrade is required for this R2 change.

Guests must have a verified invitation and a saved attending RSVP. Every photo read checks their current session; hosts can also view photos. Bucket keys are never public album links. Browser-supplied storage capability headers are ignored. Internal coordination routes cannot be called directly from the public website.

The R2 path has no fixed photo-count cap per household. Each upload still has a 3 MiB server limit and request rate limits. The browser accepts JPEG/PNG/WebP originals up to 25 MiB, reduces the longest side to 2,000 pixels, and aims for around 1 MiB; it is a sharing copy, not an original-resolution archive. The gallery loads 50 photos at a time, with Load more for the rest.

R2 is metered storage, not unlimited free storage. Current Standard pricing includes 10 GB-month per month, 1 million writes and 10 million reads monthly; additional storage is $0.015/GB-month plus applicable operation charges. R2 has no internet egress fee. Worker and Supabase usage are separate. Review the current Cloudflare prices and account billing terms before activating R2: https://developers.cloudflare.com/r2/pricing/ . At 1 MB per shared photo, 1,000 photos use approximately 1 GB.

## 1. Update the existing wedding backend manually

In the Supabase wedding project `eucviawdbrnplxoxhvxw`, open Edge Functions → `wedding-api` → its code editor. Replace both existing source files with the versions in this branch:

- `backend/edge/index.ts` → `index.ts`
- `backend/edge/api.mjs` → `api.mjs`

Deploy the updated function. Preserve its existing secrets and gateway authentication. Preserve its existing Verify JWT setting: this function authenticates its own opaque sessions and the private gateway. Do not create another project, reset tables, or change any Summit project.

Deploy the backend first. It remains compatible with the existing frontend and Supabase uploads. The updated gateway requires this backend for photo options, R2 metadata and paginated photos.

## 2. Create the bucket in Cloudflare

Open R2 Object Storage in your own Cloudflare account, review/enable R2 billing if requested, and create a **Standard** bucket named `joshandmara-guest-photos`.

Leave public access disabled: no public `r2.dev` endpoint and no custom public bucket domain. The Worker binding provides private access; guest browsers use `/api/photo/<id>` on the wedding site.

## 3. Deploy the Worker with its R2 binding

The existing `wrangler.jsonc` retains the Supabase upload path. `wrangler.r2.jsonc` enables R2 explicitly and declares the `WEDDING_PHOTOS` binding. Do not select the R2 config before creating its bucket.

For the reviewed release in Cloudflare Workers Builds, use:

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy --config wrangler.r2.jsonc`

Keep the existing `WEDDING_GATEWAY_SECRET` Worker runtime secret. Do not paste it into GitHub or a public environment variable. The Worker name is the same in both configs, so changing configs must target the intended wedding Worker.

If you use a new preview or workers.dev URL, add its exact HTTPS origin to the wedding backend's `site_origins` allowlist before testing login. The existing custom domain already has an allowed origin. Do not widen the allowlist to arbitrary origins.

## 4. Verify before switching the live domain

Use the Josh Holdren test invitation. Verify Yes, No and Maybe; only Yes may open the private guide. Upload a small test photo and check it appears in the R2 bucket and private gallery. Sign out and confirm the photo URL requires verification again. Test another verified attending household and the owner account. Existing Supabase photos, if any, must also load.

Until that live check passes, R2 support is prepared but unverified against your actual Cloudflare bucket. Do not claim the album has moved.

## Recovery

If an upload fails, the photo is not added to the gallery before R2 accepts the file. Metadata completion retries once and is idempotent. A confirmed rejected metadata write removes its newly uploaded object. If the completion result is uncertain (network/server failure), the object is retained to avoid deleting a photo whose metadata may already be saved. The guest is asked to refresh the album before retrying; an unreferenced object may need later owner cleanup.

To pause new R2 uploads while retaining access to existing R2 photos, keep deploying the R2 config and binding but set its `PHOTO_STORAGE` value to `supabase`. The original 30-photo household limit then applies to new Supabase uploads. Removing the R2 binding makes already uploaded R2 photos unavailable; it does not move or delete them.
