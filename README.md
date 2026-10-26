# FinisPay × FinisFlow

Interactive software-only prototype connecting simulated payments with inventory, batch, manufacturing-date and expiry tracking.

Production: https://finispay-finisflow-secure.vercel.app

## Current demo access

- FinisPay is the single entrance for both FinisPay and FinisFlow.
- Create a profile with one username only; no email, password, OTP or login link is requested.
- Login matches the username exactly and is case-sensitive. For example, `ShantanuT` and `shantanut` are different profiles.
- The active profile, inventory, simulated payments and dashboard activity are stored in that browser's local storage and restored after refresh or reopen.
- Signing out removes only the active session; the browser keeps that profile's demo data for the next exact-username login.

## Important security limitation

Username-only access is intentionally a demonstration mode, not secure authentication. Anyone using the same browser and knowing an exact username can open that profile. Do not enter sensitive, personal or real payment information. Cross-device login is not supported.

The earlier Supabase schema and Row Level Security migration remain in this repository for a future secure account mode, but the username-only demo does not weaken or anonymously expose those database tables. A production service should use a second factor such as a passkey, PIN, password or verified link.

## Features

- FinisPay send, receive, QR generation and QR/barcode camera simulation
- Automatic demo inventory capture after a simulated purchase
- Manufacturing-date and expiry tracking
- FEFO ordering and at-risk inventory value
- Discount, bundle, move, return and reorder recommendations
- Personal browser-local profile and activity persistence

## Local setup

```bash
pnpm install
pnpm dev
```

No environment variables are required for the current browser-local demo mode. `.env.example` documents the optional isolated Supabase configuration retained for a future secure mode. Never add a Supabase service-role key to frontend code, Vercel client variables or GitHub.

## Deployment

The `main` branch deploys automatically to the existing `finispay-finisflow-secure` Vercel project. The included `vercel.json` selects Next.js and adds response-security headers.

## Verification

Run `pnpm test`, `pnpm lint` and `pnpm build`, then verify:

1. Create `DemoUser` and confirm its dashboard opens.
2. Add inventory or a simulated payment, refresh, and confirm it remains.
3. Sign out and log in with `DemoUser`; confirm the same data returns.
4. Try `demouser`; confirm it does not match `DemoUser`.
5. Create a second username and confirm its browser-local dashboard starts separately.
6. Confirm the interface never asks for or stores a password.

