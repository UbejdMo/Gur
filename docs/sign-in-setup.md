# Setting up sign-in

Players can sign in with Google to keep a name, an eight-digit ID and a picture. The accounts live in a [Supabase](https://supabase.com) project. Until that project exists and the app knows its address, nothing about signing in is shown and everybody plays as a guest.

This is done once, by whoever owns the game. It takes about 15 minutes and costs nothing.

## 1. The Supabase project

1. Create an account at [supabase.com](https://supabase.com) and a **new project** (the free plan is enough). Pick a region close to the players (Frankfurt is next to the game server). The database password it asks for is not needed by the game; keep it somewhere safe.
2. Open **SQL Editor**, start a new query, paste the whole of [`supabase/migrations/0001_profiles.sql`](../supabase/migrations/0001_profiles.sql) and press **Run**. It makes the table of profiles and the rules for who may change what. It is safe to run again.

## 2. Google

1. In the Supabase project, open **Authentication**, then **Sign In / Providers** (just "Providers" in some versions of the dashboard), and pick **Google**. Leave the page open: it shows a **Callback URL** (it looks like `https://<project>.supabase.co/auth/v1/callback`) that Google needs.
2. Open the [Google Cloud console](https://console.cloud.google.com), create a project (any name, for example "Gur"), and open **Google Auth Platform**.
3. **Branding**: app name "Gur" and your e-mail address. **Audience**: External.
4. **Clients > Create client**, type **Web application**:
   - **Authorized JavaScript origins**: `https://ubejdmo.github.io`
   - **Authorized redirect URIs**: the Callback URL from step 1
5. Copy the **Client ID** and **Client secret** into the Google page in Supabase, switch the provider on and save. The secret goes nowhere else: not into the code, not into a chat.
6. Back in Google, under **Audience**, press **Publish app**. While it says "Testing", only the test users listed there can sign in.

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

Once that is merged, the web game shows **Sign in with Google** on its first screen, and the game server's start-up line says `accounts on`.

## How it fits together

- The app sends the player to Google through Supabase and gets a sign-in token back. The token is kept by the browser, so the player stays signed in.
- The first sign-in makes the player's profile by itself: the Google name without spaces (four digits are added if it is taken), a random eight-digit ID, the Google picture. The player can change the name; the ID never changes.
- When a signed-in player opens or joins a lobby, the app sends the token along. The game server asks Supabase whose token it is and reads that player's profile, so a name and picture at the table cannot be made up. A player without a token is a guest under the name they typed.
- Signing in works in the web game. The Android and iOS apps get it with their store builds.

## Trying it without a Supabase project

The browser tests do exactly this: `apps/client/e2e/fake-supabase.mjs` stands in for Supabase, and `e2e/account.spec.ts` signs in, renames and plays through it (`pnpm test:e2e`).
