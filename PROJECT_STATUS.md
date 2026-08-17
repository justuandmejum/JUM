# JUM — Project Status

**Read this file first in any new session before doing anything else.** It exists specifically so work can resume cleanly after a context/window switch without re-deriving decisions already made.

## What JUM is

A one-to-one listening service (not therapy/counselling) — customers book a paid voice session with a dedicated listener. India-based (justuandme.in, owned on GoDaddy), currently a **personal pilot project**, expecting **under 50 customers/month**. Cost-consciousness at pilot scale has driven several infrastructure decisions below — don't default to "the more robust option" without checking whether it's actually justified at this traffic level.

## Two artifacts exist — know the difference

1. **`C:\Users\saiku\Downloads\JUM prototype bilingual.html`** — a single-file, self-contained HTML/CSS/JS prototype. Fully bilingual (English/Telugu), navy/gold brand identity, and covers the *entire* customer journey end to end: home page, booking with a real 5-minute client-side slot-hold simulation, payment (with dynamically-required method fields), confirmation, live-call screen with extension flow, feedback with a sustainability-donation flow, host panel, and four fully-written legal policies (Terms/Privacy/Disclaimer/Refund). **Everything in it is simulated client-side — no real payment, no real backend.** Its value now is as the **reference for exact copy, UX flow, and visual design** when building the real app. Read it before building any real page so the real version matches what was already designed and refined over many iterations, rather than re-deriving copy/flow from scratch.
2. **`C:\Users\saiku\chandu jum\jum-app`** (this repo) — the real Next.js application being built to replace the prototype's simulated backend with a genuine one. This is what's "in progress" right now.

## Architecture decisions (and why — don't re-litigate without new information)

- **Frontend + backend:** Next.js 16 (App Router, TypeScript, Tailwind), deployed to **Azure Static Web Apps, Free tier**. Upgrade to Standard ($9/mo) only when traffic actually justifies it — it's a plan toggle, not a redeploy.
- **Scheduled/background jobs** (slot-hold expiry, 24h/1h/10min reminders): **Azure Functions**, Consumption plan (timer triggers). Free-grant usage (1M executions/mo) comfortably covers pilot scale.
- **Database:** **Neon PostgreSQL**, free tier. Connected and live (see below).
- **Rejected, with reasons:**
  - *Hostinger shared "Unlimited" hosting* — confirmed directly by Hostinger support: no PostgreSQL, Node.js not always-on (no persistent process, so payment webhooks could be missed), limited SSH, no custom background daemons. Their own answer: use a VPS for always-on Node + Postgres.
  - *Hostinger VPS (KVM1, ~$6.49→$11.99/mo)* — technically fine, but more ops burden (self-managed patching/security/Postgres admin) than justified at <50 customers/month once Azure's free tier covered the same needs for less money and less maintenance.
  - *Vercel Hobby (free)* — ruled out because its own terms restrict it to non-commercial use, and JUM charges real money even as a pilot. Vercel Pro ($20/mo) would be fine but is the most expensive option compared.
  - *Railway (~$5–10/mo)* — a reasonable option, but Azure ended up both cheaper (~$9/mo total) and better suited once the Functions timer-trigger pattern was matched to the reminder/hold-expiry need specifically.
- **Payment gateway:** Razorpay (not yet integrated — Phase 4). Chosen for UPI + India-native support and built-in PCI compliance.
- **Video/audio calling:** Daily.co (not yet integrated — Phase 6). Note: Twilio discontinued its video product in 2024, so it's SMS/WhatsApp-only in this stack, not video.
- **SMS/WhatsApp:** Twilio. **Email:** Resend. (Both Phase 5, not yet integrated.)

The full phased roadmap (8 phases + deploy step, each tagged "you do this" vs "I build this") is published as an artifact — ask the user for the link if needed, or reconstruct from this file; the phase list below is the authoritative short version.

## Roadmap phase status

- [x] **Phase 0** — Accounts/decisions. Neon account created and connected. Azure/GitHub accounts not yet created (needed before any deploy validation).
- [~] **Phase 1** — Backend & database skeleton. **In progress, most of it done:**
  - [x] Next.js 16 scaffolded at `jum-app/` (TypeScript, App Router, Tailwind) — builds clean
  - [x] Full Prisma schema written: `User`, `Booking`, `Payment`, `Session`, `Feedback`, `AvailabilityRule`, `Admin` — see `prisma/schema.prisma`, fully commented
  - [x] Connected to real Neon database, initial migration applied — **tables exist for real, not simulated**
  - [x] Partial unique index added (`prisma/migrations/20260817072322_add_slot_unique_index`) enforcing at the **database level** that no two bookings can hold the same `(date, startTime)` while both are in an active status — this is the actual double-booking prevention mechanism, and it's been **tested and confirmed working** (not just written) via `scripts/test-slot-lock.ts`
  - [x] `lib/prisma.ts` singleton client set up (Prisma 7 requires an explicit driver adapter — see Gotchas below)
  - [x] Git initialized, two commits made, identity set globally (Chandu / hello@justuandme.in)
  - [ ] Not yet done: any actual pages/API routes/UI — the schema and DB exist, but no booking flow has been built in Next.js yet
- [~] **Phase 2** — Real availability engine (replaces prototype's hardcoded 9am–10pm calendar). **Core engine done:**
  - [x] `lib/availability.ts` — computes open windows per date from `AvailabilityRule` (RECURRING_OPEN by day-of-week, DATE_OPEN overrides, BLOCKED/HOLIDAY subtracted), subtracts occupied ranges from active `Booking`s (CONFIRMED/PAYMENT_PENDING/COMPLETED, plus TEMPORARILY_HELD while `holdExpiresAt` hasn't passed), and returns bookable 30-min-aligned start times for a requested duration — excludes past times for today (IST)
  - [x] `GET /api/availability?date=YYYY-MM-DD&duration=<mins>` route, `force-dynamic`, validated inputs — tested live against the real Neon DB via dev server
  - [x] `scripts/seed-availability.ts` — seeded 7 `RECURRING_OPEN` rows (09:00–22:00 every day) so default behavior matches the prototype; already run against the real DB
  - [x] `scripts/test-availability.ts` — 14/14 checks passing (plain open day, booking-overlap exclusion at two durations, full-day block, partial lunch-break block, today's past-time exclusion)
  - [ ] Not yet done: admin UI for editing `AvailabilityRule`s (that's Phase 7) — for now hours are only set via the seed script/direct DB edits
- [~] **Phase 3** — Real booking system / server-enforced slot lock. **Core mechanics done:**
  - [x] Booking state machine now matches the prototype's real UX (not a demo simplification): `PENDING_APPROVAL` → `TEMPORARILY_HELD` → `PAYMENT_PENDING` → `CONFIRMED` → `COMPLETED`, or `BOOKING_FAILED` (declined, or either window timed out). `PENDING_APPROVAL` is a genuine product decision — JUM manually accepts/declines every request within a response window before the customer pays — confirmed against the prototype's own "JUM is reviewing your request" screen and copy, not just its demo simulate-buttons.
  - [x] Added `PENDING_APPROVAL` to `BookingStatus` (two migrations: `20260817080744_add_pending_approval_status` for the enum value, `20260817080800_update_slot_index_for_pending_approval` for the partial unique index — see Gotchas below for why they're split)
  - [x] `lib/bookings.ts` — pricing table (30/60/120/180 min → ₹199/349/649/899, matching the prototype exactly), call-code generator (`JUM-XXXXXX`, matching the prototype's charset), `createBookingRequest` (validates against live availability, find-or-create user, 15-min approval window), `approveBooking` (→ `TEMPORARILY_HELD`, 5-min payment window), `declineBooking`, `confirmBooking` (→ `CONFIRMED` — this is the exact seam Phase 4's Razorpay webhook will call once it exists), `expireStaleHolds`, `listPendingApprovals`
  - [x] `lib/availability.ts` updated so `PENDING_APPROVAL` (like `TEMPORARILY_HELD`) blocks a slot only while its window hasn't expired
  - [x] API routes: `POST /api/bookings` (public), `POST /api/bookings/:id/approve`, `/decline`, `/confirm`, `GET /api/bookings/pending`, `POST /api/bookings/expire-stale` (all four admin ones gated by `lib/admin-auth.ts` checking an `x-admin-key` header against `ADMIN_API_KEY` — a deliberately minimal stand-in for Phase 7's real admin auth, not a placeholder to forget about)
  - [x] `scripts/test-bookings.ts` — 20/20 checks pass; also smoke-tested the full HTTP flow (create → pending list → approve → confirm, plus the 401 on a missing admin key) against the dev server
  - [ ] **Known gap, not yet solved:** there is no real-time notification when a new request comes in — `GET /api/bookings/pending` has to be checked manually/polled until Phase 5 (Resend/Twilio) exists. Don't treat "JUM is notified instantly" as delivered yet.
  - [ ] Not yet done: cancellation endpoints (`CUSTOMER_CANCELLED`/`JUM_CANCELLED`), and the scheduled trigger that's supposed to call `expire-stale` automatically (needs the Azure Function from the deploy step)
- [ ] **Phase 4** — Real payment (Razorpay). Not started.
- [ ] **Phase 5** — Notifications (Resend + Twilio). Not started.
- [ ] **Phase 6** — Real calling (Daily.co). Not started.
- [ ] **Phase 7** — Admin dashboard. Not started.
- [ ] **Phase 8** — Security/privacy audit pass. Ongoing consideration, formal pass not started.
- [ ] **Deploy** — Azure Static Web Apps "hello world" validation deploy, to confirm Next.js SSR/API routes actually behave correctly on Azure SWA before building further. **Not done yet** — needs an Azure account and a GitHub repo, neither created yet. This was the planned next step before the Phase 1 DB work took priority instead.

## Important gotchas learned this session (do not rediscover these the hard way)

- **This machine had no Node.js installed.** Installed via `winget install OpenJS.NodeJS.LTS`. It's at `C:\Program Files\nodejs`. **The PATH is now set correctly and permanently** (User env var) — but if a *new terminal session* still can't find `node`/`npm`, that's just because the shell process predates the PATH fix; open a genuinely fresh terminal.
- **Next.js 16 has real breaking changes from typical training-data knowledge.** Before writing Next.js code in a fresh session, read `jum-app/node_modules/next/dist/docs/` directly (especially `01-app/01-getting-started/08-caching.md` and `01-app/03-api-reference/03-file-conventions/route.md`) rather than assuming prior knowledge is current. Key points already confirmed: route handler `params` is a `Promise` (must `await`); the new "Cache Components" (`cacheComponents: true` in `next.config.ts`) is a major opt-in paradigm shift and is **currently OFF** — this project uses the familiar previous caching model, so mark dynamic routes explicitly with `export const dynamic = 'force-dynamic'` (booking/webhook endpoints will need this).
- **Prisma 7 also has breaking changes:**
  - Generator is `provider = "prisma-client"` (not `prisma-client-js`), output path is explicit (`app/generated/prisma`), and **that generated folder has no `index.ts`** — import from the file directly: `from "../app/generated/prisma/client"`, not the bare directory.
  - `PrismaClient` **requires an explicit driver adapter** — it no longer reads `DATABASE_URL` implicitly. See `lib/prisma.ts` for the working pattern (`@prisma/adapter-pg` + `PrismaPg`).
  - DB connection URL lives in `prisma.config.ts` (via `dotenv`), not directly in `schema.prisma`'s datasource block.
  - Standalone scripts (outside Next's own dev server) don't auto-load `.env` — run them with `npx tsx -r dotenv/config <script>`.
- **`.env` contains the real Neon connection string already** (gitignored, not committed — `.env.example` is the tracked template). No need to re-ask the user for it in a fresh session; just confirm `jum-app/.env` still exists and has a valid `DATABASE_URL`. It now also has `ADMIN_API_KEY` (generated Phase 3, real random value already in place).
- **Postgres won't let a newly added enum value be used in the same transaction that added it.** Adding `PENDING_APPROVAL` to `BookingStatus` and then referencing it in the partial unique index's `WHERE` clause had to be two separate migrations (run via two separate `prisma migrate dev` invocations), not one hand-edited file — combining them fails. Also: after hand-writing a migration folder (rather than letting `prisma migrate dev` generate it), remember to run `npx prisma generate` — `migrate dev` regenerates the client for migrations *it* creates, but picked up our hand-written folder as "apply pending migrations" and skipped regen, leaving the client stale until generated explicitly.
- **`prisma.config.ts`'s `dotenv/config` import doesn't reach plain `node -e` one-liners or `.mjs` files run outside `tsx`** — stick to `npx tsx -r dotenv/config <script>.ts` for one-off DB scripts, same as the existing test scripts, rather than improvising inline `node -e`.
- The `jum-app` folder name was deliberate — the parent folder `chandu jum` has a space in it, which breaks npm package naming, hence scaffolding into a subfolder.

## Immediate next step (where this session paused)

Phase 2 (availability) and Phase 3's core booking mechanics (see above) are both done. Two options are on the table for next session, user hasn't picked yet:
1. Build Phase 4 (real payment — Razorpay), which plugs into the exact seam already built for it (`confirmBooking()` in `lib/bookings.ts`, currently called manually/by admin key — Phase 4 replaces that trigger with a real webhook), **or**
2. Do the Azure "hello world" deploy validation first (needs Azure account + GitHub repo created by the user first)

Worth raising with the user regardless of which is picked: Phase 3 left a known gap (no real-time "new request" notification — see Phase 3 status above) and no cancellation endpoints yet. Ask the user which they'd like before proceeding.
