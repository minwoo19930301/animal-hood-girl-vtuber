# MINGO VTuber Model — Design & Layer Contract (v1)

A rig-ready, fully layered VTuber avatar of **Mingo the flamingo** (the DOOMINGO / SUPER MINGO
mascot), generated 100% from code. Output is a real layered `.psd` (Live2D-convention part
separation) plus per-part PNGs (drop-in upgrade path for the existing vtuber-lab Python PNGTuber)
and a rigging guide.

## Character brief

Kawaii mascot bust-up, front-facing and symmetric (rig-friendly). Soft cel shading: base + one
shade tone + highlights, thick clean outlines. Big glossy VTuber eyes. Cute, confident, a little
smug — she has kicked demon shell in two games.

**Palette** (brand-locked to the games):
plumage base `#ffb3cf` · plumage shade `#f27ba8` · deep pink accent `#ff5e9c` · outline `#b23a68` ·
chest fluff cream `#ffd6e4` · beak salmon `#ff8e72` · beak tip `#241631` · iris gradient
`#ff5e9c → #7a1f4d` · blush `#ff8ea6` · scarf gold `#ffc857` · night purple (lines/dark) `#241631` ·
BG (toggleable) lagoon `#8fd3e8`.

## Canvas & geometry model sheet (2400 × 3200, character centered at x=1200)

Draw to these coordinates. Shapes are soft/rounded; NO hard polygon corners anywhere.

- **Head**: rounded egg, center (1200, 1080), rx 560, ry 520; subtle cheek-fluff scallops (3 tiny
  bumps) on each lower side. Slight taper toward chin (bottom of head y≈1600).
- **Crest front (fringe)**: 3 rounded feather locks sprouting from crown (y≈620) sweeping to
  viewer-right, tip of longest at (1520, 760). Widths 90-140.
- **Crest back**: 4 larger feather shapes behind the head silhouette, fanning up-left from crown,
  longest tip (760, 460).
- **Eyes** (HUGE): centers L(940, 1120) R(1460, 1120); eye-white ellipse rx 190 ry 230, tilted ±4°
  (outer edge up). **Iris**: full circle r150 (draw COMPLETE circle — overdraw under lids), radial
  gradient `#ff5e9c` (top) → `#7a1f4d` (bottom rim). **Highlights**: big soft circle r55 upper-left,
  sparkle r22 lower-right, tiny 4-point star glint near top. **Upper lash**: bold arc, stroke ≈34px,
  `#241631`, 3 short lash flicks at outer corner. **Lower lash**: thin arc, outer half only.
  **eyelid_upper**: skin-tone (`#ffb3cf`) lid shape covering the top 15% of the eye (used for blink
  interpolation). **eye_closed** (hidden toggle): single gentle downward curve ∪ with tiny lashes.
- **Brows**: feather-tuft ovals ≈120×46 at (940, 830) & (1460, 830), `#d94f85`, slight outer lift.
- **Beak** (small & cute, flamingo downcurve): upper beak from (1080, 1300) to (1320, 1300), 240
  wide, ≈150 tall, salmon base with the flamingo **black dipped tip** on the lower third; smooth
  banana downcurve, rounded tip at (1200, 1440). **beak_lower**: smaller jaw shape (draw COMPLETE,
  tucks under upper when closed — mouth-open rig rotates it down). **mouth_inside**: deep pink
  `#7a1f3d` oval + tiny tongue `#ff8ea6` (both fully drawn, hidden behind closed beak).
- **Blush**: soft ellipses (830, 1330) & (1570, 1330) rx 110 ry 60 at ~55% alpha + 3 short diagonal
  strokes each.
- **Neck**: gentle S-curve tube, width ≈170: head-bottom (1200, 1560) → slight right bulge →
  body-top (1200, 2050). OVERDRAW: extend 200px up INTO head and 250px down INTO torso.
- **Chest fluff**: cloud-scallop ruff (7-9 bumps) around neck base, span ≈900px wide centered
  (1200, 2100), cream `#ffd6e4` — reads as a fluffy collar; breathing target.
- **Scarf**: thin gold `#ffc857` knotted scarf just above the fluff, small trailing tail to
  viewer-left; pearl charm bead at the knot.
- **Torso**: rounded egg 1000×1100 centered (1200, 2650) (bottom crops off-canvas = bust-up).
- **Wings (arms)**, named by CHARACTER side (Live2D convention; ArmL = viewer-RIGHT):
  tucked-front little wing-hands, rounded 380×520 at viewer-left (750, 2500) and viewer-right
  (1650, 2500), 3 feather-finger scallops at tips, tone `#ff8fbb`; far-wing slivers behind torso.
- **Tail**: 3 feather tips peeking behind body viewer-left (650, 2900), shade tone.
- **Shrimp pin** (brand!): curled shrimp charm ≈140px at (1420, 700) clipped into the fringe,
  salmon with gold outline.
- **FX toggles** (all hidden): heart irises (both eyes, `#ff4f8e` hearts r≈150), happy-closed eyes
  (∪∪ pair), sweat drop (right temple, 110px teardrop), anger mark (comic ✚ vein, left crown).

## Shading rule

Every visible part gets: flat base fill → one shade tone on lower/right areas (soft blob shapes,
not gradients) → outline stroke 10-14px `#b23a68` (face/body) or `#241631` (eyes/beak) → optional
1-2 small highlight blobs `rgba(255,255,255,0.55)` upper-left. Shade layers live INSIDE their part
group as `<part>_shade` where listed so riggers can deform them together.

## PSD layer tree (EXACT names & order — this is the contract; ~36 layers)

```
BG                       (flat lagoon color, visible)
Back                     [group]
  crest_back
  wing_far_L
  wing_far_R
  tail_back
neck
Body                     [group]
  torso
  torso_shade
  chest_fluff
  scarf
  ArmL                   [group]  (character-left = viewer-right wing)
    wing_L
    wing_L_shade
  ArmR                   [group]
    wing_R
    wing_R_shade
Head                     [group]
  head_base
  head_shade
  blush
  EyeL                   [group]
    eye_white_L
    iris_L
    eye_highlight_L
    eyelid_upper_L
    eyelash_upper_L
    eyelash_lower_L
    eye_closed_L         (hidden)
  EyeR                   [group]  (mirror of EyeL, same sublayer names with _R)
  Brows                  [group]
    brow_L
    brow_R
  Beak                   [group]
    mouth_inside
    tongue
    beak_lower
    beak_upper
  crest_front
  shrimp_pin
FX                       [group]  (all children hidden)
  heart_eye_L
  heart_eye_R
  eyes_happy_L
  eyes_happy_R
  sweat_drop
  anger_mark
```

**Overdraw rules (critical for rigging):** iris/highlight full circles even under lids; beak_lower,
mouth_inside, tongue drawn complete though occluded; neck sits BELOW Body in paint order (torso
and chest_fluff cover the neck bottom) and overdraws its FILL into both the head and torso/fluff
zones with no outline stroke where it dives under those occluders (side edges only get an outline);
torso extends under chest_fluff; wings overdraw 60px into torso edge; crest_back roots extend 80px
into head. Never bake a part's occlusion into another part.

## Tech

- Node ES modules. Deps: `ag-psd` (PSD write/read) + `@napi-rs/canvas` (headless canvas, prebuilt).
- `node build.mjs` → `dist/mingo.psd`, `dist/preview.png` (flattened composite), `dist/parts/*.png`
  (every leaf layer, full-canvas-position PNGs), `dist/layer-report.json` (tree, bounds, hidden flags).
- Structure: `build.mjs` (assembly+export), `src/palette.mjs`, `src/shapes.mjs` (smooth-path/blob/
  feather/ellipse helpers over canvas ctx), `src/parts/{head,eyes,beak,body,wings,fx}.mjs` — each
  part module exports draw functions that paint onto provided layer canvases (2400×3200 each).
- Self-check inside build: after writing, `readPsd` the file back and assert the layer tree matches
  the contract EXACTLY (names, order, groups, hidden flags) — fail loudly otherwise.
- PSD must open in Photoshop/Krita/Live2D Cubism: RGB 8-bit, layer canvases full-size, groups as
  section dividers (ag-psd `children`), hidden via `hidden: true`.

## RIGGING.md must cover

- Live2D Cubism import: PSD → parts mapping table: ParamEyeLOpen/ParamEyeROpen (eyelid_upper +
  eye_closed swap), ParamMouthOpenY (beak_lower rotation, mouth_inside reveal), ParamBrowLY/RY,
  ParamAngleX/Y/Z (Head group), ParamBodyAngleX/Z (Body), breathing (chest_fluff + torso scale),
  wing waves (ArmL/ArmR), FX toggles as expressions (heart/happy/sweat/anger).
- VTube Studio: use the rigged Cubism model; toggle hotkeys for FX layers.
- vtuber-lab PNGTuber upgrade path: which `dist/parts/*.png` to combine for the 4-sprite set
  (idle / blink / mouth-open / blink+mouth-open) so the existing Python tracker works with the new
  art unchanged.

## Non-negotiables

- All-original art. The exact layer names above (case-sensitive). Deterministic output (no RNG
  without fixed seed). No network access at build time. Zero native system deps beyond the two npm
  packages. Everything re-runnable: `npm install && node build.mjs`.
