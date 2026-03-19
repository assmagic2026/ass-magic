# Sphere Glide Prototype Spec

## 1. Overview

- Project name: `Glide Prototype`
- Platform: smartphone web browser / desktop browser
- Rendering: Three.js (`three.module.js`)
- Purpose: a low-poly third-person gliding prototype with a spherical world, continuous forward motion, mobile touch controls, and a clear day / twilight / night mood shift
- Asset policy: no external art assets; visuals are built from procedural geometry, flat colors, emissive materials, and a lightweight sky shader

## 2. Runtime / Launch

- Main entry: `index.html`
- Script: `main.js` (ES module)
- Style: `style.css`
- Recommended launch: local HTTP server
  - Example: `python3 -m http.server 8000 --bind 0.0.0.0`
- Reason: the project uses ES modules and is more reliable over `http://localhost:8000` than direct `file://` opening

## 3. Current Core Concept

- The player travels around a small low-poly planet instead of a flat map
- The planet and the sun are fixed in world space and do not move
- The player moves continuously along the tangent of the spherical surface
- Vertical movement is radial:
  - push the control downward to climb away from the planet
  - push the control upward to descend toward the planet
- Because the world is spherical, the player can keep moving forever without hitting a map edge

## 4. World Specification

### 4.1 Planet

- Shape: procedural low-poly sphere
- Base radius: `340`
- Terrain: procedural height variation added on top of the sphere radius
- Surface style:
  - checker-like color breakup
  - hill / valley tint variation
  - flat-shaded low-poly look

### 4.2 Sky / Sun / Time-of-day Look

- A fixed sun exists in the scene as a visible glowing sphere
- Lighting uses:
  - one strong directional light from the sun direction
  - one very weak cool fill light from the opposite side
  - low ambient light
- The sky is shader-based and changes by direction relative to the fixed sun:
  - day side: blue sky
  - middle band: twilight / dusk zone
  - night side: dark blue / deep navy sky

### 4.3 Night Zone

- The anti-sun hemisphere contains a fixed "otherworld" zone
- Night-side scenery includes:
  - neon towers
  - glowing crystal shrines
  - floating halo rings
  - colored point-light accents
- Visual goal: neon city + mystical alien sanctuary feel

### 4.4 Atmosphere Markers

- Clouds are placed around the planet at higher altitude
- Beacon-like objects are placed around the world as distant visual anchors

## 5. Camera Specification

- View: third-person chase camera
- Behavior:
  - smoothly follows behind the player
  - uses the local planet normal as camera up vector
  - slightly adjusts based on speed and climb / descent direction
- Goal: keep motion readable while wrapping around the spherical world

## 6. Player Movement Specification

### 6.1 Horizontal Motion

- The player is always moving forward
- Ground forward speed: `7`
- Air forward speed: `12`
- Minimum air cruise speed is maintained so the player does not stall easily
- Boost and dive temporarily increase travel speed

### 6.2 Vertical Motion

- There is no passive "always sinking" rule anymore
- Neutral input tends to settle vertical speed toward zero
- Downward control input causes ascent
- Upward control input causes descent
- Continuous downward input allows indefinite altitude gain

### 6.3 Ground / Air State

- The player can contact the planet surface and travel along it
- Pushing upward from the surface transitions into flight
- Ground contact resets available boost charges

### 6.4 Boost

- The right-side button is `Boost`
- Effect:
  - adds forward energy
  - does not directly lift the player upward
- Max charges: `4`
- Charges recover on ground contact

### 6.5 Dive

- A downward swipe on the right side triggers dive mode
- Dive effect:
  - pushes the player downward
  - stores extra forward energy
  - increases later glide speed

## 7. Control Specification

### 7.1 Mobile Controls

- Right-bottom stick:
  - horizontal: curve left / right
  - vertical down: ascend
  - vertical up: descend
- The stick currently has:
  - half-strength response compared with a previous stronger tuning
  - smoothing / inertia so it does not snap instantly
  - a deadzone near center
- Left side drag:
  - auxiliary turn / climb input
- Right-side swipe down:
  - dive
- `Boost` button:
  - forward boost

### 7.2 Input Feel

- Stick horizontal direction is currently reversed from the original version to match the user's requested direction
- Stick response is intentionally smoothed for a gliding feel rather than an arcade snap
- During turns, the player banks smoothly
  - left turn: left wing lowers, right wing rises
  - right turn: right wing lowers, left wing rises

### 7.3 Zoom Prevention

- Multi-touch zoom and accidental browser magnification are suppressed as much as possible via:
  - viewport settings
  - gesture prevention
  - double-tap prevention
  - multi-touch prevention

## 8. Visual Style Specification

- Low-poly geometry
- Flat-shaded materials
- Mostly color-based presentation instead of texture-heavy rendering
- Emissive / neon accents used mainly in the night zone
- Mobile-friendly rendering choices:
  - no physics engine
  - no heavy post-processing
  - modest geometry counts
  - low-cost lighting model

## 9. Current Important Tuned Values

- Planet radius: `340`
- Ground speed: `7`
- Air cruise speed: `12`
- Minimum air speed: `9`
- Stick scale: `0.5`
- Boost charges: `4`
- Camera distance base: `11`

## 10. File Roles

- `index.html`
  - page shell
  - HUD
  - canvas mount
- `style.css`
  - full-screen layout
  - HUD placement
  - virtual stick appearance
  - mobile interaction restrictions
- `main.js`
  - world generation
  - player movement
  - camera
  - touch controls
  - day / dusk / night sky
  - night-zone emissive scenery
- `three.module.js`
  - bundled Three.js runtime

## 11. Current Limitations

- No explicit game objective, scoring, quests, or collectibles yet
- No audio yet
- No UI for pause, settings, or remapping
- No save system
- Night zone is decorative; it does not yet change gameplay systems
- Terrain collision is only the planet surface; there are no obstacle collisions with towers / shrines / clouds

## 12. Suggested Next Steps

- Add a simple loop goal such as gates, relic collection, or route challenges
- Give the night zone unique gameplay behavior, not only visuals
- Add wind trails, contrails, or boost effects to improve speed readability
- Add sound and haptics-style feedback for boost / dive / touchdown
- Add a small in-game settings panel for sensitivity and camera tuning
