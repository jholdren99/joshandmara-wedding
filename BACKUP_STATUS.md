# Backup status and deployment handoff

This branch contains the full editable application source and public photo assets, including changes that have not been deployed. It does not contain private database records or credentials.

## Currently published website

The existing website remains at https://joshandmara.rsvp. Its last published frontend includes the seating planner, larger outside seat labels, padded zoom/pan workspace, and corrected door labels.

## Pending frontend work included here

- Eight-second RSVP introduction and a funny wedding-superpower question replacing the attire question.
- A dedicated decline screen, with confirmation and no meal questions.
- Required-response progress tracking, conditional meal choices, and saved confirmation.
- Private directions/hotel links and a personal trivia editor with household leaderboard.
- Browser-side photo resizing/compression. The private Supabase photo bucket and 30-photo household limit remain in use. Private Cloudflare R2 support is now implemented and tested with local fakes; it is NOT active. See PHOTO_STORAGE_SETUP.md for the manual backend update, bucket setup and Cloudflare deployment. R2 removes the household count cap once activated.

## Supabase state

The wedding backend is separate from the frontend. backend/edge contains an updated API that must be deployed manually before this release. Chicken/Steak meal choices and private Catawba Falls Events directions/hotel suggestions have already been saved. Personal trivia is a private draft awaiting the couple’s answers; it has not been published.

The deployed w_quiz table has round (text, default legacy) and total (integer, default 3), with a composite primary key (household, round). Do not reapply migrations blindly. Existing guest and seating records remain in Supabase.

## Cloudflare deployment

Use Node 22 or later. Build: npm run build (or bash scripts/build.sh). Deploy: npx wrangler deploy. worker/index.js is generated from public/ and worker/runtime.js and is intentionally excluded from this backup.

The current API proxy requires a WEDDING_GATEWAY_SECRET runtime secret and an allowed site origin in the wedding backend settings. No secret values are included. Do not replace the live domain until those are configured and logins/RSVPs are verified. The .openai manifest is retained for compatibility with the existing build; it does not deploy this backup automatically.

This repository does not back up the private guest database, photo bucket, or live runtime secrets. Those remain in their existing services.

Release validation: 32 automated checks cover RSVP access, private trivia, seating, R2 authorization/upload failure handling, and gallery pagination past 500 photos. Browser checks cover the eight-second intro, friendly No confirmation, required meal validation and Yes progress/portal transition using isolated fixtures. No real guest RSVP or seating assignments were changed. No live Cloudflare R2 integration has been tested or enabled.
