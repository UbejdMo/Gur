# Setting up sign-in

Players can sign in with Google to keep a name, an eight-digit ID and a picture. The accounts live in a [Supabase](https://supabase.com) project. Until that project exists and the app knows its address, nothing about signing in is shown and everybody plays as a guest.

This is done once, by whoever owns the game. It takes about 15 minutes and costs nothing.

## 1. The Supabase project

1. Create an account at [supabase.com](https://supabase.com) and a **new project** (the free plan is enough). Pick a region close to the players (Frankfurt is next to the game server). The database password it asks for is not needed by the game; keep it somewhere safe.
2. Set up the database. Either let GitHub do it (see [The database keeps itself up to date](#the-database-keeps-itself-up-to-date) below), or do it by hand: open **SQL Editor** and run every file in [`supabase/migrations`](../supabase/migrations), one after the other in the order of their numbers (new query, paste the whole file, **Run**). They make the table of profiles and the rules for who may change what.

## 2. Google

1. In the Supabase project, open **Authentication**, then **Sign In / Providers** (just "Providers" in some versions of the dashboard), and pick **Google**. Leave the page open: it shows a **Callback URL** (it looks like `https://<project>.supabase.co/auth/v1/callback`) that Google needs.
2. Open the [Google Cloud console](https://console.cloud.google.com), create a project (any name, for example "Gur"), and open **Google Auth Platform**.
3. **Branding**: app name "Gur" and your e-mail address. **Audience**: External.
4. **Clients > Create client**, type **Web application**:
   - **Authorized JavaScript origins**: `https://ubejdmo.github.io`
   - **Authorized redirect URIs**: the Callback URL from step 1
5. Copy the **Client ID** and **Client secret** into the Google page in Supabase, switch the provider on and save. The secret goes nowhere else: not into the code, not into a chat.
6. Back in Google, under **Audience**, add yourself and anyone else who will try the game under **Test users**. While the app says "Testing", only they can sign in (up to 100 people).
7. To open sign-in to everybody, fill in three links under **Branding** and save, then press **Publish app** under **Audience**. Google only allows publishing once they are there:
   - **Application home page**: `https://ubejdmo.github.io/Gur/`
   - **Application privacy policy link**: `https://ubejdmo.github.io/Gur/privacy.html`
   - **Application terms of service link**: `https://ubejdmo.github.io/Gur/terms.html`

## 3. Where players come back to

In Supabase, open **Authentication > URL Configuration**:

- **Site URL**: `https://ubejdmo.github.io/Gur/`
- **Redirect URLs**: add `https://ubejdmo.github.io/Gur/**`, and `http://localhost:8081/**` for the app running on a developer's computer.

## 4. Tell the app and the game server

Two values are needed. Both are public by design, so they can be in the code:

- the **project URL** (`https://<project>.supabase.co`)
- the **publishable key** (`sb_publishable_...`); both are in the project's **Connect** dialog, and the key is also under **Settings > API Keys**

Never use the secret key (`sb_secret_...`) or the `service_role` key anywhere in this repo.

They go in two places:

| Where           | How                                                                                      |
| --------------- | ---------------------------------------------------------------------------------------- |
| The app         | `DEFAULT_SUPABASE_URL` and `DEFAULT_SUPABASE_KEY` in `apps/client/src/account/config.ts` |
| The game server | `SUPABASE_URL` and `SUPABASE_KEY` in `render.yaml`                                       |

Once that is merged, the web game shows **Sign in with Google** on its first screen, and the game server's address (opened in a browser) answers `Gur game server: ok (accounts on)`. If it still says `guests only`, the server was not made from `render.yaml`: add the two values by hand under **Environment** in the Render dashboard.

## The database keeps itself up to date

Changes to the database are files in `supabase/migrations`. After every merge into `main`, once the checks have passed, the **Deploy** workflow applies the files the database has not seen yet, in the order of their numbers, and only then publishes the web game. If a file fails, it is undone as a whole and the deploy stops; nothing is left half-done.

For that, GitHub needs the database's address, password included. It is set once:

1. In Supabase, press **Connect** at the top of the project and choose **Session pooler**. Copy the address; it looks like `postgresql://postgres.<project>:[YOUR-PASSWORD]@aws-...pooler.supabase.com:5432/postgres`. (The "Direct connection" does not work from GitHub.)
2. Replace `[YOUR-PASSWORD]` with the database password. If you do not have it any more, make a new one under **Database > Settings > Reset database password**; nothing in the game uses it. A password of letters and digits only saves trouble: other characters have to be written in a special way inside an address.
3. In the GitHub repository, open **Settings > Secrets and variables > Actions**, press **New repository secret**, name it `SUPABASE_DB_URL`, paste the address and save.

This address opens the whole database. It belongs in that secret and nowhere else: not in the code, not in a chat, not in an issue.

Without the secret the workflow leaves the database alone and says so; new files then have to be run by hand in the SQL Editor.

The first run applies the files that were run by hand before; that is harmless, they are written to be safe to run again. From then on the database remembers what it has seen (in `supabase_migrations.schema_migrations`), so a file is applied exactly once and must never be changed after it was merged: a change is a new file.

Every pull request rehearses the update first (`pnpm --filter @gur/server rehearse:migrations`): the same tool applies all the files to a database made for the test.

## How it fits together

- The app sends the player to Google through Supabase and gets a sign-in token back. The token is kept by the browser, so the player stays signed in.
- The first sign-in makes the player's profile by itself: the Google name without spaces (four digits are added if it is taken), a random eight-digit ID, the Google picture. The player can change the name; the ID never changes.
- When a signed-in player opens or joins a lobby, the app sends the token along. The game server asks Supabase whose token it is and reads that player's profile, so a name and picture at the table cannot be made up. A player without a token is a guest under the name they typed.
- A player can delete their account on the first screen. That removes the sign-in and the profile from Supabase at once; the player's own request to the database does it (`delete_account` in `0002_delete_account.sql`), so no secret key is involved.
- Signing in works in the web game. The Android and iOS apps get it with their store builds.

## Trying it without a Supabase project

The browser tests do exactly this: `apps/client/e2e/fake-supabase.mjs` stands in for Supabase, and `e2e/account.spec.ts` signs in, renames and plays through it (`pnpm test:e2e`).
