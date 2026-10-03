# Battle Golf — playable redesign

A desktop browser golf brawler built with React, Three.js, Rapier and Colyseus. Everyone plays simultaneously. This release concentrates on a complete three-hole Party loop and Solo Practice.

## Play

- Public Party: up to eight golfers, empty places filled with casual bots.
- Private Party: share the room code; the host can start when friends are ready.
- Solo Practice: choose any of the three courses, reset the ball, repeat the tutorial.
- Original skinned golfer: two body variants, two outfits, eight colors, three hats, four faces, blinking, twelve animation clips and held item props. Blender source and generator are included.
- Six items: homing rockets, two landmines, freeze bombs, six-second shields, spring boots and eight-second coffee boosts. Three inventory slots.

| Input                       | Action                                            |
| --------------------------- | ------------------------------------------------- |
| WASD / mouse                | Camera-relative run / look                        |
| Hold right mouse            | Aim beside your settled ball                      |
| Hold and release left mouse | Charge for up to 1.2 seconds, then swing          |
| Mouse wheel while aiming    | Putt 8°, Chip 30°, Lob 55°                        |
| Space / F                   | Directional dive / forward club attack            |
| 1–3 / Q / G                 | Select item / use (hold Q for rocket lock) / drop |
| T / Tab / M / Esc           | Quick chat / scorecard / map / pause              |
| Shift / Enter               | Keyboard aim toggle / hold and release to swing   |

Browsers without pointer lock use middle-drag to look. Settings include remapping, mouse sensitivity, invert Y, graphics, master/music/effect volumes, and reduced motion.

Shots launch at the club's contact frame, 250 ms after commitment. The server measures charge duration; client-supplied power cannot increase shot strength. Movement cancels an uncommitted shot and hits can interrupt a swing before contact. Walking cannot push a ball. Only your ball activates checkpoints; water/falls cost a stroke when the ball resets. Avatar falls leave the ball alone.

Party scoring: finish points 20/16/13/10/8/6/4/2, up to three stroke bonus points, up to two successful attack bonus points, only awarded after finishing. DNF earns zero. First finish starts a 25-second finishing window. Results last eight seconds, then the next hole begins.

## Courses

1. **Clover Circuit:** wide fairway, sand, water, bank-shot route.
2. **Splitwater Crossing:** safe bridge with corners, central island, water-clear shortcut.
3. **Windmill Works:** rotating gate, side route, access ramp and raised green.

Visual terrain and physical collision surfaces share the same course definitions. Bots follow authored waypoints and use the same movement controller, charge timing and ball physics as players.

## Development

Node 24 is recommended.

```sh
npm ci
npm run dev
npm run check
npm test
npm run build
```

Vite serves port 5173; the game server uses port 2567. Guest play and practice do not require Supabase. Existing Supabase account/progress endpoints remain available for future account features; this guest-first client does not expose the old ranked/progression/shop UI.

Network protocol v2 rejects old clients with a reload message. Native Colyseus inputs run at 30 Hz, physics at 60 Hz, snapshots at 20 Hz. Shared Rapier movement predicts the local golfer, replays inputs after authority acknowledgements and interpolates remote entities. Golf balls, items, hits, checkpoints and points remain authoritative. UI updates are limited to 10 Hz. The physics module loads separately from the initial interface.

Tests cover rig animation, three bot playthroughs, shot contact/interruption, momentum transfer, directional melee, immunity, checkpoint ownership, item limits, finishing/scoring, delayed reconciliation and eight real SDK clients sharing a shot.

## Assets

`tools/build_golfer.py` creates `assets/source/golfer.blend` and `public/assets/golfer.glb` using Blender 4.5 LTS. For example:

```sh
blender -b -t 2 -P tools/build_golfer.py
```

The model, rig, clips, procedural music and additional sounds are original to this project. Footsteps/impacts/menu samples are CC0 Kenney assets. See `ASSET_CREDITS.md` and the bundled license files.

## Hosting and current limits

The existing `render.yaml` uses a free Node web service plus a static site. A free server supports one active room, can sleep while idle, and loses an active match if its process restarts. Solo Practice stays available when the server is busy. Google sign-in, Ranked, Royale, cars, orbital lasers, purchases, voice chat, replay and extensive custom physics are outside this redesign's release scope.

60 fps on the target hardware is a performance target, not a measured guarantee. Low graphics disables shadows and caps render resolution. Public matchmaking and private rooms share the single room capacity on the free server.
