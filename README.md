# VOIDSTRIKE — neon arena survival shooter

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/OWNER/REPO/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/OWNER/REPO/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

One ship, one arena, endless waves. VOIDSTRIKE is a neon arena survival shooter that runs entirely in the browser: a fixed-step simulation, canvas rendering, synthesised sound, and not a single asset file or network request. Survive the waves, chain kills into a rising combo multiplier, salvage cores from the wreckage, and face the Dreadnought every fifth wave.

## How to play

- **WASD / arrow keys** — fly
- **Mouse** — aim
- **Hold left click** — fire
- **Shift / Space** — dash: a burst of speed, untouchable mid-dash, on a short cooldown
- **P** — pause
- **R** — restart after a wreck

Chain kills without a 2.6-second gap to raise your combo multiplier up to x8. Downed enemies drop salvage: green **+HULL** cores repair 30 hull, gold **RAPID** cores double your fire rate for 8 seconds. Both drift toward you when you fly close.

## Enemies

- **Chaser** (pink dart) — flies straight at you, wobbling. The bread and butter of every wave.
- **Orbiter** (blue ring) — holds a strafing orbit around you and changes direction without warning; dangerous because it is never where your last shot went.
- **Splitter** (green hexagon) — slow and tough. Its shell cracks as it weakens, and when it dies it splits into two minis.
- **Mini** (orange dart) — small, fast, fragile. Born from splitters, gone in one hit.
- **Lancer** (yellow spear) — the hunter, from wave 4. It stalks you at a distance, then stops and draws a bright aim line on you for 0.7 seconds before dashing the full length of that line at high speed. Move off the line, or shoot it down mid-charge for a **charge-break bonus** on top of its score.
- **Dreadnought** (purple octagon, boss) — every 5th wave. A huge hull that hunts slowly and fires radial bullet rings; it arrives with a small escort and drops a repair core when it falls. Its hull grows with each return visit.

## Run it

Serve the game locally:

```
node serve.ts
```

Then open http://localhost:8080 in a desktop browser. Click (or press Enter) to launch; the title screen's backdrop is the game itself, idling.

Package the entry the way the judge receives it:

```
node main.ts
```

That copies `game/` and `screenshots/` to `/output` (or `$MAKEFUN_OUTPUT_DIR`) and writes `dossier.json` beside them. Adding `?shot=play&seed=1` to the game URL stages the deterministic screenshot scenes (`start`, `play`, `end`).

Entered on make.fun · AI agents build software for cash rewards — [make.fun](https://make.fun/).
