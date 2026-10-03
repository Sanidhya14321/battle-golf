# Battle Golf

A browser golf brawler with a procedural Three.js world, Rapier physics, and an authoritative Colyseus multiplayer server.

## Play locally

Requires Node.js 24.

```sh
npm ci
npm run dev
```

Open http://localhost:5173. Solo practice works without accounts or a database. Party, Royale, and Custom use the local server on port 2567. Open multiple browser windows to play together.

WASD moves, left-drag downward builds shot power, release swings, right-drag aims, and the mouse wheel changes loft. Space dives, F strikes with the club, E enters/exits a cart, H honks, 1–3 selects an inventory slot, R uses an item, X drops it, and T opens quick chat. Controls can be remapped in Settings.

## Implemented

- Up to eight simultaneous networked golfers; casual bot fill, private room codes, spectator camera, and quick chat.
- Twelve procedural holes across six themes, checkpoints, water, sand, moving obstacles, wind, ramps, and boost pads.
- Eleven usable items including homing rockets, rifles with recoil, mines, orbital strikes, shields, freeze bombs, boots, coffee, and four-seat carts.
- Party, three-life shrinking-zone Royale, restricted human-only Ranked, configurable Custom, and Solo Practice.
- Multi-hole scoring, attacks, style bonuses, 240 catalog cosmetics, and an account leaderboard.
- Optional Supabase Google authentication, protected account equipment, atomic cosmetic purchases, and idempotent match rewards through a private server-authenticated Edge Function.

This is an initial playable implementation. Course geometry is procedural, several cosmetic variants share shapes, and balance needs playtesting. There is no voice chat or replay archive. Ranked requires Google OAuth configuration. This free deployment deliberately runs one active room at a time; busy clients receive a retry message. Matches are in memory and are lost if the service restarts.

## Verify

```sh
npm run check
npm test
npm run build
```

Tests exercise all course worlds, shot validation, real ball momentum transfer, shields, checkpoint respawns, item ammunition, rule bounds, Elo, and eight real WebSocket clients.

## Accounts and deployment

Copy `.env.example` to `.env.local` for local account integration. Never commit secrets. Browser variables prefixed `VITE_` are public. `GAME_SERVER_TOKEN` must remain server-side and match the private database configuration used by `game-admin`.

The existing Supabase project is configured with the schema in `supabase/schema.sql` and the Edge Function in `supabase/functions/game-admin/index.ts`. To reproduce it, apply the schema, provision the private server token, and deploy the function with JWT verification disabled; the function verifies its own server token and user credentials. It uses Supabase's built-in service-role environment variable internally.

Enable Google in Supabase Authentication with your Google OAuth client ID and secret. Add the Supabase callback URI to Google and the live website URL to Supabase's allowed redirect URLs. Google OAuth credentials must be configured by the account owner.

`render.yaml` describes a free Node service and a static frontend. Set the frontend `VITE_GAME_SERVER` to the backend's HTTPS URL, and backend `WEB_ORIGIN` to the frontend origin. Both services use the same public Supabase URL/key; only the backend receives `GAME_SERVER_TOKEN`. Free web services can sleep and require a cold start.

## Source layout

`packages/game` contains shared content and physics; `apps/server` owns networking, validation, and persistence; `apps/web` contains the React interface, rendering, controls, and audio. `supabase` contains database and Edge Function source.
