# IBERFIT Exercise Visual Standard v1

This file is normative. Detailed composition and delivery rules live in `EXERCISE_MEDIA_SYSTEM_V1.md`.

## Core visual contract

- The exercise asset is a **pure visual**. Never bake exercise names, `Inicio`/`Final`, technical cues, instructions, metrics, badges, UI chrome or explanatory copy into the image.
- All semantic information belongs to the application UI and accessible markup, not to pixels inside the asset.
- Canonical aspect ratio is **4:5 portrait**.
- New generation starts from a **high-resolution 1280×1600 master** (or larger at the same ratio) and deterministically derives the current **640×800 WebP delivery asset**. Never upscale a 640×800 delivery asset to create a master.
- The central movement must remain readable in library cards, live Client/Coach sessions and a future fullscreen viewer without manual re-cropping.
- Keep a protected outer safe area of at least **6% on every edge** for non-essential visual material. Hands, feet, head, load, supports and all biomechanically relevant joints must stay inside the protected composition.
- `start` and `end` show the same approved athlete, outfit, gym, camera language, equipment setup, crop logic and lighting; only the movement phase changes.
- A `movement` asset may combine start/end when useful. Both phases must remain immediately legible without text labels.

## Approved IBERFIT identity

- Use the same approved male athlete/mannequin language across the library unless a later versioned visual system explicitly replaces it.
- Outfit is sober black technical sportswear.
- The **only IBERFIT branding permitted inside the visual is the exact official isotipo, small on the shirt**.
- Use the official repository isotipo asset. Never redraw, regenerate, approximate or let an image model invent it.
- No wordmark, wall logo, equipment logo, shorts logo, repeated isotipo, invented marks or AI-generated branding.

## Composition

- The exercise is always the protagonist. Background, anatomy and decoration are subordinate.
- Premium dark-gym background: dark green / near-black foundation, warm cream-neutral highlights and restrained gold accents only where they improve hierarchy.
- No neon, generic SaaS glow, excessive gradients, visual noise or decorative lighting that competes with the movement.
- Frame tightly enough to understand the movement at card size while keeping all relevant anatomy, equipment and support points visible.
- Do not create dramatic cinematic angles when a neutral instructional angle communicates the movement more accurately.
- Camera, lens language and perspective must remain consistent between movement phases.

## Anatomy inset

- A compact anatomical inset is strongly preferred when it adds useful information and does not obscure biomechanics.
- Place it in the **upper visual zone**, normally the upper-right corner, using one consistent geometry across the library.
- Keep the inset visually secondary: target roughly **16–22% of image width**, never large enough to compete with the athlete.
- Highlight primary working musculature clearly; secondary musculature may be shown with lower emphasis when useful.
- The inset contains **no labels or text**. Muscle names live in the UI/card metadata.
- Do not cover the athlete, moving load, contact points or the motion path.

## Multi-context requirement

Every approved asset must remain effective in all of these contexts without a bespoke redesign:

1. compact library card;
2. Client live-session view;
3. Coach live-session view;
4. exercise detail/library inspection;
5. future fullscreen/zoom viewer.

The UI may choose a smaller derivative for performance, but the visual system remains the same.

## QA and publication

- Biomechanics must be instructionally correct and unambiguous.
- Visual QA checks identity consistency, crop, anatomy scale, background restraint, branding restraint, artifacts and readability at compact size.
- Generated candidates remain quarantined until biomechanics and visual QA are both approved.
- Before `human_approved=true`, compare the candidate against currently approved IBERFIT library assets for athlete identity, crop, lighting, background prominence, isotipo placement and anatomy scale.
- Publication is exact-ID based, idempotent and fail closed.
- A beautiful image that is biomechanically ambiguous is rejected.
- A biomechanically correct image that breaks the IBERFIT visual system is also rejected.
