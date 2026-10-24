# Josh & Mara Wedding

Wedding pages and private owner/guest features. Build with `npm run build` and validate with `npm run validate`. Editable public assets live in `public/`; `scripts/embed-assets.mjs` packages them with `worker/runtime.js`. The backend source is in `backend/edge/` and deployed separately as the Supabase `wedding-api` function.

The owner-only seating planner uses `/api/admin/seating`. Private guest records and draft table positions are stored in the dedicated Supabase project, never bundled with public assets. Eight seat slots per table, single-assignment validation, and revision-based conditional updates protect the shared draft. The initial 107-person seating draft was imported from the Google Sheet; ongoing website edits do not synchronize back to Sheets. A private draft does not publish seating assignments to guest accounts.

This branch is a source backup for migration to GitHub and Cloudflare. Read BACKUP_STATUS.md before deploying. The gateway token is a runtime secret. Source contains no invitation codes, guest data, or privileged Supabase keys.

The RSVP starts with a eight-second decorative joke, then working Yes, No, and Maybe choices. Yes offers an optional four-question quiz before the actual household form. No opens a dedicated decline confirmation; Maybe goes directly to the form. Only the final submission saves a response. Maybe is a distinct database status and does not unlock the attending guest portal. Server-marked test invitations remain visible to owners but are excluded from guest counts and RSVP exports.

The expanded owner seating map supports wheel/pinch zoom and background drag pan. Circular tables contain draggable first-name lists with clockwise numbered chairs. Guest management adds to Unseated or removes from seating only. Changes autosave after 500 ms; idle windows refresh every five seconds. Revision checks and three-way merging retain independent owner edits; competing edits stop saving and ask owners to review, never silently overwriting a shared seat. Owners should wait for Saved before closing.

The owner draft starts with 14 tables. Owners can add tables (up to 40) or remove a table; removing an occupied table requires confirmation and leaves all of its guests Unseated. Unseated serves as the temporary rearranging area.

The seating map displays names outside each circular table at clockwise seat positions; full names remain available on hover and selection. The 14-table draft was restored from the owner-provided dashboard PDF dated October 23, 2026, preserving its exact seat order.

The owner map has a screen-space margin of at least 900 pixels on every edge, with pointer-anchored zoom and centered Fit room. Seat names use larger 28px text and wider labels. This is a view-only change; guest assignments are unchanged.

Guest updates: eight-second RSVP intro and optional superpower question; required-answer progress includes invitation verification, household attendance, conditional meal choices, and final saving. Chicken/Steak are provisional. Venue/travel content stays in owner settings and attending-guest APIs. Personal trivia drafts are owner-only; publishing validates four distinct options and one correct answer per question. Answer keys stay server-side; one entry per household per round, with test households excluded from rankings. Guest photos are resized to 2000 pixels and compressed to JPEG before the existing private 3 MB upload endpoint; the 30-photo household limit remains.
