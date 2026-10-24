# Wedding RSVP, trivia and poll release

The reviewed source is in PR #2, branch `updates/rsvp-and-private-photo-album`. This release has not been deployed by the assistant. The live seating plan and real RSVPs have not been changed.

## What is included

- Eight-second joke before real Yes/No/Maybe choices, with an immediate skip option.
- No opens a friendly decline confirmation, saves declined attendance and does not open the attending portal. Old meal selections are cleared for non-attending guests.
- Required-answer progress, Chicken/Steak placeholder meals, and the replacement wedding-superpower question.
- Private venue/travel links and hotel suggestions already configured in the wedding database.
- Ten-question trivia, with its leaderboard above the quiz. Your final private answer file can be imported through the owner dashboard; correct answers are not embedded in public assets or committed to GitHub.
- Ten Josh/Mara poll questions. All ten choices are required before submitting. Percentages are revealed only after submission. Each invitation household has one editable ballot, so updating votes cannot add duplicates. Test invitations are excluded from percentages and the trivia leaderboard. Poll and trivia are optional; neither changes RSVP completion.
- Optional private R2 album and paginated gallery. See PHOTO_STORAGE_SETUP.md for the separate R2 activation steps and pricing.

## Manual deployment order

1. In the existing Supabase wedding project `eucviawdbrnplxoxhvxw`, replace both files of `wedding-api` from this branch: `backend/edge/index.ts` and `backend/edge/api.mjs`. Deploy the function, preserving its existing gateway/session authentication and secrets.
2. Build and release this branch to your wedding Cloudflare Worker. Build command: `npm run build`. Deploy command without R2: `npx wrangler deploy`. If the private R2 bucket is configured, follow PHOTO_STORAGE_SETUP.md and use its R2 deploy command instead. Keep the existing `WEDDING_GATEWAY_SECRET` secret and the precise site-origin allowlist.
3. Log in as an owner, open Wedding settings, and use **Import your private trivia answer file (JSON)** to choose `Josh_and_Mara_Trivia_Answers.json` provided separately in this conversation. It saves a private draft. Review the ten questions, then choose **Publish trivia round**. Never upload this answer file to GitHub or public/.
4. Test with the Josh Holdren test invitation: confirm the eight-second intro; verify No/Maybe cannot enter activities; save Yes with a meal; play trivia; submit all ten poll answers and see percentages. With a test invitation, your own votes and score are deliberately excluded from real rankings/totals.
5. Verify with a real attending household when ready, including that incomplete polls cannot submit and an updated ballot does not increase the total. Confirm private photo access, if enabled, before switching the live domain.

## Database requirements

The existing wedding database already has the trivia `round`/`total` schema and the `(household, round)` primary key. Do not reset or recreate it. The poll uses existing server-only `w_settings` rows with a versioned per-household key. No new SQL migration, public grants, or RLS policy changes are needed for the poll or R2 release. Private seating records remain untouched.

## Verification

Build and artifact validation pass. 35 automated checks cover guest/owner access, No/Maybe/Yes, private trivia scoring, poll validation/result gating/replacement/aggregation, seating conflict safety, and private photo handling. The real Cloudflare R2 bucket remains unverified until you configure it and complete the live upload check.
