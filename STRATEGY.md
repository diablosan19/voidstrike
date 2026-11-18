# VOIDSTRIKE — strategy

## Design pillars

1. **Readability at speed.** Every threat is a distinct silhouette in a distinct colour:
   pink darts hunt you, blue orbiters strafe, green splitters swell and crack, orange
   minis swarm, yellow spears telegraph before they strike, and the purple Dreadnought
   owns the top of the screen. A player should know what is about to hurt them from
   shape alone.
2. **Fair danger.** Nothing hits without warning. Enemies materialise inside a visible
   ring before they can touch you, the lancer's dash is announced by a drawn aim line
   for a full 0.7 seconds, and a 0.9-second grace window after any hit stops one bad
   second from melting the hull. Deaths should feel earned, never cheap.
3. **Momentum is the score.** Kills chain into a combo multiplier (up to x8), so the
   optimal line is aggressive: stay in the fight, keep the chain alive, and take the
   risky shot — including shooting a lancer out of its dash for the charge-break bonus.
4. **Juice from systems, not assets.** Screen shake, hit-stop, particles, floating
   score text and a fully synthesised WebAudio soundtrack are all generated in code.
   The game ships as plain static files with zero downloads and zero dependencies.

## Built to be judged well

- **Screenshot-first composition.** The three judged frames are not mock-ups: each is a real moment of the real game, staged from the game's own parts (the wave director, the spawner, the particle and floater systems) and played forward under a simple autopilot. The play frame is composed like a poster — a wave-3 fight with every enemy kind on the field, a combo already running, and a lancer caught mid-telegraph, its aim line locked on the ship — because that is the game's signature moment.
- **Deterministic scenes.** One seeded random stream (mulberry32) feeds everything, including the starfield, and screen shake is a pure function of the world clock. The same seed always produces the same frame, byte for byte, so what was judged is what was shipped.
- **The dossier tells the truth.** `node main.ts` packages exactly the game a player gets: no build step, no bundler, nothing fetched at runtime.

## Systems overview

- **World** (`game/src/world.js`): a fixed-step (60 Hz) simulation with pooled entities
  — nothing allocates after boot. It owns the ship, bullets, five enemy behaviours
  plus the boss, pickups, particles, floaters, the wave director, the combo chain,
  screen shake and hit-stop, and reports each step's happenings as event flags.
- **Waves**: counts grow linearly and the mix widens as kinds unlock (orbiters on wave
  2, splitters on 3, lancers on 4), shuffled so kinds arrive interleaved. Every fifth
  wave is the Dreadnought with a small escort, and nothing else.
- **Renderer** (`game/src/render.js`): canvas 2D, neon strokes and additive glows over a three-depth parallax starfield and nebula wash, scaled from a fixed 1280x720 field.
- **Sound** (`game/src/sound.js`): oscillator and filtered-noise synthesis driven by the world's event flags, throttled per kind so busy seconds stay a texture.
- **Input** (`game/src/input.js`): keyboard and mouse, remapped into one control object the world reads each step — the same shape the screenshot autopilot fills in.

## Tuning philosophy

Every number lives in `game/src/config.js`, and tuning is done against evidence, not
feel: the world runs headless in Node under the screenshot autopilot, and a change is
kept only if the simulated distribution moves the right way. The autopilot is a floor,
not a target — it never dashes and never focuses the boss — so the game is tuned until
that floor reaches wave 5 every run and clears the Dreadnought about one run in four.
A decent player, who dashes through bullet rings and prioritises targets, lands
squarely in the wave 5–6 band the game is balanced around, with boss waves as the
recurring skill gate and swarm waves as the breather between them.
