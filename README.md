# Racing Limits Pro — HTML5 Game

## Folder Structure
```
racing-limits-pro/
├── index.html          # Single-page entry point
├── css/
│   └── style.css       # All styles (responsive, animations, HUD)
├── js/
│   ├── audio.js        # Web Audio API engine (procedural SFX)
│   ├── renderer.js     # Canvas 2D rendering (road, vehicles, particles)
│   ├── entities.js     # Player, traffic, collision, particle pool
│   ├── game.js         # Core loop, modes, scoring, input
│   ├── ui.js           # Screen management, HUD updates
│   └── main.js         # Bootstrap, button wiring, settings
└── README.md
```

## Setup
1. Serve the folder from any static web server, e.g.:
   ```bash
   npx serve .
   # or
   python3 -m http.server 8080
   ```
2. Open `http://localhost:8080` in a modern browser.
3. No build step, no dependencies (Google Fonts loaded from CDN, optional).

## Iframe Integration
```html
<iframe
  src="https://your-domain.com/racing-limits-pro/"
  width="100%"
  height="600"
  style="border:none; display:block; max-width:900px; margin:auto;"
  allow="fullscreen; autoplay"
  title="Racing Limits Pro">
</iframe>
```
Responsive embed (maintains aspect ratio):
```html
<div style="position:relative; padding-bottom:60%; height:0; overflow:hidden;">
  <iframe
    src="https://your-domain.com/racing-limits-pro/"
    style="position:absolute; top:0; left:0; width:100%; height:100%; border:none;"
    allow="fullscreen; autoplay"
    title="Racing Limits Pro">
  </iframe>
</div>
```

## Game Modes
| Mode        | Description                         |
|-------------|-------------------------------------|
| One Way     | Classic endless, traffic moves away |
| Two Way     | Oncoming traffic on 6-lane highway  |
| Time Attack | Score as much as possible in 60s    |
| Free Ride   | No game over, explore freely        |

## Controls
| Desktop          | Mobile          |
|------------------|-----------------|
| ↑ / W — Accelerate | ▲ button       |
| ↓ / S — Brake    | ▼ button        |
| ← / A — Lane L   | ◀ button        |
| → / D — Lane R   | ▶ button        |
| Space — Hard Brake | Swipe L/R     |
| Shift — Nitro    | ⚡ button        |
| P — Pause        | ⏸ HUD button    |

## Performance Notes
- Targets 60 FPS with `requestAnimationFrame`.
- `dt` (delta time) capped at 4× frame to prevent spiral-of-death on tab switch.
- Traffic uses a simple pool — vehicles are spliced out when offscreen.
- Canvas 2D uses `alpha: false` context for compositing speedup.
- Procedural audio via Web Audio API — zero HTTP requests for sound.
- `will-change` and GPU compositing via CSS transforms on overlay panels.

## Mobile Notes
- `touch-action: none` on body prevents scroll interference.
- Mobile controls auto-shown on touch devices via CSS `pointer: fine` media query.
- Swipe support for lane changes on game canvas.
- Vibration API on crash (toggle in Settings).
- `maximum-scale=1` viewport prevents double-tap zoom.

## Customization
- Player colors: add `data-color` dots in Settings HTML.
- Add new vehicle types in `entities.js → VEHICLE_TYPES`.
- Tweak difficulty curve in `game.js → diffTimer / spawnInterval`.
- New game modes: extend `Game.MODES` and handle in `update()`.
