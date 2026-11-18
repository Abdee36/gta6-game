# Solmarina — an open-world crime game

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/Abdee36/gta6-game/rank.svg)](https://make.fun/bounty/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/Abdee36/gta6-game/reward.svg)](https://make.fun/bounty/gta6-01)

Solmarina is a top-down open-world crime game that plays offline in a desktop
browser from static files — built for [make.fun's "Make GTA 6" bounty](https://make.fun/bounty/gta6-01).
Marco Venn came to Solmarina with $120 and a fast car. Iris Kade has work, if
he can handle the heat.

Everything in it is original: the city, the characters, the names, the story,
the art and the synthesized sound. No Rockstar Games name, character, map or
asset appears anywhere.

## What is in the game

- **A city to explore** — a seeded grid of roads, blocks and buildings, a
  marina bay, a beach, a park, and named districts, on foot and by car.
- **Traffic and pedestrians** — cars cruise the roads, pedestrians walk the
  sidewalks and flee from gunfire and crashes.
- **Cars to steal and drive** — six models with distinct handling, car damage,
  smoke, wrecks, skid marks and a respray garage.
- **A wanted system and police** — five stars, pursuing police cars with
  flashing light bars and sirens, busting, evading, and heat that cools down.
- **Missions and a story** — three jobs for Iris Kade (a timed delivery, a car
  repo, a dockside shootout), plus taxi fares and 12 hidden cash stashes.
- **Combat** — mouse-aimed shooting, rival gunmen, bullets, health packs.
- **A HUD with a minimap** — health, money, wanted stars, mission objectives
  with distance and timers, speed, and a live minimap.
- **A start, a save and polish** — title screen, pause, help, wasted/busted
  screens, localStorage saves, and WebAudio sound and music (synthesized, no
  files).

## How to run it

No build step and no network request. Serve `game/` with any static server:

```sh
node serve.ts
```

then open http://localhost:8080 in desktop Chrome. Or open `game/index.html`
directly in a browser that allows ES modules from local files.

## Controls

| Action | Keys |
| --- | --- |
| Move / drive | W A S D or arrow keys |
| Run | Hold Shift on foot |
| Enter / steal a car | E near a car |
| Shoot | Aim with the mouse, click to fire |
| Start a job | E at the yellow marker by Iris' office |
| Respray (clear wanted) | Drive into Lucky Garage with $200 |
| Pause | P or Esc |
| Sound | M to mute |

## Layout

- `main.ts` — the entrypoint: copies `game/` and `screenshots/` to the output
  directory and writes `dossier.json` with the vendored make.fun library.
- `game/index.html` — the page; `game/src/*.js` — one module per system
  (city generation, actors, police, missions, rendering, sound, input, save,
  screenshot scenes).
- `screenshots/` — four real renders of the game running in a browser.
- `shots.json` — the `?shot=` scenes each screenshot was taken from.
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged.
- `serve.ts` — a tiny static server for local play.

## License

MIT — see `LICENSE`.
