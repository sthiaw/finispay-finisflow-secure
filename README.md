# FinisPay × FinisFlow — isolated secure account

This is a new application, database and deployment. It does not reuse or modify the existing FinisFlow Supabase or Vercel projects.

Production: https://finispay-finisflow-secure.vercel.app

The production project uses repository-scoped GitHub deployment, an isolated Supabase project and Brevo custom SMTP for password-recovery email. SMTP credentials stay encrypted in Supabase and are not committed to this repository.

## Authentication behaviour

- FinisPay is the only authentication entrance.
- Sign-up uses full name, email and password. There is no OTP or magic-link login.
- A successful signup starts a session immediately and opens the personal dashboard.
- The same session opens FinisFlow without another login.
- Supabase Auth owns password hashes. Application tables and browser code never receive or store plain-text passwords.
- The browser stores only the Supabase session required to remain signed in.
- Forgot password uses Supabase's password-recovery email.

## Local setup

1. Create a new Supabase project specifically for this application.
2. In **Authentication → Providers → Email**, enable email/password and disable **Confirm email** so signup returns a session immediately.
3. Apply `supabase/migrations/20261001000000_initial_auth_schema.sql` to the new project.
4. Copy `.env.example` to `.env.local` and provide the new project's URL and publishable key.
5. Install and run:

   ```bash
   pnpm install
   pnpm dev
   ```

## Supabase configuration

Set the Authentication Site URL to the production Vercel URL. Add local development and production URLs to the redirect allow list so password recovery can return to the application.

The migration creates:

- `profiles`, keyed to `auth.users.id` and populated by an `auth.users` trigger.
- `user_dashboard_data`, keyed by `user_id`.
- ownership indexes, timestamp triggers, explicit Data API grants and Row Level Security policies based on `auth.uid()`.

The frontend uses only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Never add a service-role or secret key to Vercel client variables, GitHub or a `NEXT_PUBLIC_` variable.

## Vercel deployment

Create a new Vercel project from this repository. Add both public environment variables for Production, Preview and Development, then deploy. The included `vercel.json` selects Next.js and adds safe response headers.

## Verification

Run `pnpm test`, `pnpm lint` and `pnpm build`. For the cloud integration, verify:

1. A first signup opens a dashboard displaying the exact saved full name.
2. Add activity, log out, log in and confirm the activity returns.
3. A second account cannot query or modify the first account's profile or dashboard rows.
4. Refresh and reopen the app and confirm the session persists.
5. Confirm an incorrect password is rejected with a generic message.
6. Confirm `profiles`, `user_dashboard_data` and browser storage contain no password fields or password values.

## Important email note

Signup does not require email verification, OTP or a magic link. Password-reset email remains enabled. The deployed project uses a verified Brevo sender through Supabase custom SMTP. For a separate deployment, configure a verified custom SMTP provider rather than relying on Supabase's restricted default sender.

