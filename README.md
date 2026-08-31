# SnZ Ventures — Client Portal

The authenticated client workspace and staff console, served from
**portal.snzventures.com**. Next.js 16 (App Router), TypeScript, Tailwind v4,
PostgreSQL.

This repository is the portal and nothing else. The public marketing site lives
separately in **SNZV-Website** (snzventures.com).

## Getting started

```bash
npm install
cp .env.example .env.local     # then set AUTH_SECRET and DATABASE_URL
npm run dev                    # http://localhost:3000
```

Generate an `AUTH_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Without it the portal refuses to authenticate anyone and the auth screens say
so plainly, rather than falling back to a predictable signing key.

## What this origin serves

```
/                     → redirects to /login (or /portal when signed in)
/login /register /forgot-password /reset-password /verify-email
/portal/              authenticated client workspace
/portal/admin/        staff console: users, cases, documents, advisors, audit
/api/auth/            register, login, logout, verify-email, password reset
/api/portal/          profile, documents, messages, notifications, intake
/api/admin/           role and status administration (super-admin gated)
```

There are no marketing routes. `/about`, `/study-abroad` and the rest are 404
here by design — `proxy.ts` has no fall-through to them because they do not
exist in this repository.

`robots.txt` disallows everything and the root layout sets
`robots: { index: false, follow: false }`. Both are deliberate: a crawler
blocked by robots.txt cannot read the meta tag, and a crawler that arrives some
other way still finds it.

## Roles

`student`, `professional`, `business` (clients, chosen at registration) plus
`advisor`, `admin` and `super_admin` (assigned by a super admin; there is no
self-service route to a staff role, and the first one is created by CLI).

> The STORED value for a job seeker is `professional` — it is a Postgres enum
> that 17 tables depend on, so renaming it would be a destructive migration to
> change a word on screen. The label lives in `lib/auth/types.ts`.

## Security

- scrypt password hashing (N=2^16, r=8, p=1) via `node:crypto`
- HMAC-SHA256 signed session cookies, httpOnly + SameSite=Lax + Secure in prod
- Sessions are revocable: tokens carry `users.session_epoch`, and signing out
  or changing a password increments it, ending the session on every device
- Authorisation is expressed **in SQL** — client reads carry
  `client_id = $viewer`, advisor reads join `staff_assignments`, so
  unauthorised rows are never fetched
- Role is re-checked against the database each request, so suspending an
  account takes effect immediately
- Documents live in private object storage; downloads go through
  `/api/portal/documents/[id]`, which authorises then mints a short-lived
  signed URL. The storage key never reaches the browser
- Audit logs strip sensitive keys, with a regex denylist as a backstop
- Rate limiting on login, registration and password reset
- `proxy.ts` is a UX redirect only, never the security boundary

### Known issues, carried over and still open

- **`getSignedUrl` is not signed on the Vercel Blob transport.** It returns a
  permanent public URL. The unguessable key is then the only confidentiality
  boundary. Prefer the Supabase or S3 transport for real client documents.
- **The CSRF helpers in `lib/auth/session.ts` are not wired up.**
  `issueCsrfToken` / `verifyCsrf` exist but nothing calls them. SameSite=Lax
  covers the ordinary cross-site POST, so this is not an open hole, but the
  code reads as a protection that is not actually in place.
- **`assertActive` fails open.** Its comment claims it fails closed for staff
  surfaces; the code returns `true` for everyone when the user row cannot be
  read.
- **The password minimum is four characters**, a deliberate and documented
  decision. See the long note in `lib/auth/password.ts` for what it costs.
- **The rate limiter is in-process.** It resets on redeploy and does not
  coordinate across replicas. Move it to Redis before running more than one
  instance.

## Environment

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL 13+, **pooled** connection string |
| `AUTH_SECRET` | 32+ chars, signs sessions and one-time tokens |
| `NEXT_PUBLIC_SITE_URL` | **This origin.** Password-reset and verification links are built from it — wrong value means a locked-out user stays locked out |
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | Document storage (preferred) |
| `S3_*` / `BLOB_READ_WRITE_TOKEN` | Alternative storage transports |
| `RESEND_API_KEY` or `MAIL_WEBHOOK_URL` | Email delivery |
| `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` | Optional Google sign-in |

`NEXT_PUBLIC_SITE_URL` is the one people get wrong. `lib/site-url.ts`
deliberately does **not** trust the request's Host header — it is
attacker-controlled, and a forged Host would have a real reset token mailed to
the account owner pointing at someone else's domain.

## Database

```bash
npm run db:verify      # apply migrations to in-memory Postgres + test queries
npm run db:status      # show pending migrations without applying them
npm run db:migrate     # apply migrations (transactional, checksummed)
npm run db:bootstrap -- --email you@example.com --name "Your Name"
npm run db:doctor      # connection and schema diagnostics
npm run check:config   # report what is and isn't configured
```

The schema needs no Postgres extensions, so it installs on managed roles that
cannot `CREATE EXTENSION`.

## Shared with the marketing site

These files also exist in **SNZV-Website** and were copied here when the portal
was split out. There is no shared package, so a change to one does **not**
reach the other — if you edit any of these, decide whether the other repo needs
the same edit:

```
app/globals.css              the whole design system and tone tokens
components/ui/Editorial.tsx  Action, TextLink and friends
components/ui/Primitives.tsx
data/company.ts              company facts: address, phone, email
lib/{seo,mail,mail-templates,site-url,storage,utils,analytics}.ts
lib/db/                      client + repos (the marketing site keeps
                             enquiries.ts for its contact form)
```

`data/company.ts` is the one to watch. It is the single source of truth for the
office address, phone number and email, and two copies can drift apart without
anyone noticing until a client rings a dead number.

## Enquiries

The marketing site's contact form writes to the `enquiries` table in **this
same database**. Staff read those at `/portal/admin/enquiries`. The two
applications are separate deployments but share one Postgres instance, so
nothing is lost by the split.
