# IBERFIT Exercise Media System v1

## Purpose

IBERFIT exercise media is a product component, not decorative artwork. Every approved visual must teach movement quickly, remain consistent across the library, work during real training and preserve IBERFIT's premium identity.

## One visual system, multiple surfaces

The same canonical visual language must serve:

- library cards;
- Client live sessions;
- Coach live sessions;
- exercise detail/inspection;
- future fullscreen/zoom presentation.

Do not create separate visual identities for those surfaces. The application chooses size and surrounding UI; the asset stays visually canonical.

## Separation of responsibilities

### The asset owns

- movement depiction;
- movement phases;
- athlete/mannequin identity;
- equipment and support geometry;
- premium environment;
- optional anatomical inset;
- exact official shirt isotipo.

### The application UI owns

- exercise name;
- start/final labels if the interface needs them;
- muscles and anatomical names;
- pattern, equipment and difficulty;
- technique cues and precautions;
- metrics, sets, reps, load and rest;
- actions, controls and navigation;
- accessibility text and alt descriptions.

No semantic UI information is baked into pixels.

## Canvas and delivery

- Ratio: 4:5 portrait.
- Generation master: minimum 1280×1600.
- Current app delivery derivative: 640×800 WebP.
- Downsampling must be deterministic and high quality.
- Never upscale a 640×800 published derivative to manufacture the master.
- Preserve a minimum 6% non-essential edge safe area so compact presentation or future viewer framing never clips biomechanically important content.

## Composition grid

### Primary movement field

The athlete and movement occupy the dominant central field. All relevant joints, hands, feet, external load, benches, bars, cables or ground contacts must be visible.

### Movement phases

When two phases are needed, start and end must share athlete, outfit, camera, equipment, environment and lighting. Only the movement changes. They may be presented side-by-side or in another approved deterministic composition, but never require baked labels to be understood.

### Anatomy zone

A compact anatomy inset may occupy the upper visual zone, normally upper-right, at approximately 16–22% of image width. It must never cover the athlete, load, support surface or trajectory.

Primary muscles receive the strongest emphasis. Secondary muscles may receive restrained secondary emphasis. No text labels are rendered into the inset.

## IBERFIT visual language

- Deep dark green / near-black foundation.
- Warm cream-neutral light and skin/environment highlights.
- Restrained gold detail only where it improves hierarchy.
- No neon.
- No generic AI/SaaS glow.
- No excessive gradients.
- No decorative effects that compete with movement.
- Premium, sober, athletic, technological and human.

## Athlete and branding

- Preserve the previously approved male athlete/mannequin identity and uniform language.
- Black technical sportswear.
- Exact official IBERFIT isotipo, small on the shirt.
- No wordmark, duplicated isotipo, wall branding, equipment branding or generated approximation.
- AI is never trusted to draw IBERFIT branding; official branding is applied deterministically from repository assets.

## Camera and biomechanics

Instructional clarity outranks cinematic drama. Use the angle that best demonstrates the exercise and joint relationships. Avoid perspective distortion, hidden limbs or foreshortening that makes the movement ambiguous.

The movement must remain understandable at compact card size. If a pose only works when zoomed in, it fails the product requirement.

## Quality gates

Every candidate must pass all of the following before publication:

1. canonical `exercise_id` identity;
2. biomechanical correctness;
3. phase consistency;
4. complete visibility of relevant joints/load/supports;
5. approved athlete/outfit identity;
6. official isotipo integrity and restraint;
7. anatomy inset consistency when present;
8. background and color-system compliance;
9. absence of baked names, labels, instructions or UI text;
10. compact-size readability;
11. visual comparison with approved IBERFIT references;
12. human approval plus existing automated QA.

A failure in any mandatory gate blocks publication.

## Pilot before scale

The first system-v1 pilot should deliberately cover different movement families, for example:

- Dominada pronada — vertical pull;
- Buenos días con barra — hip hinge;
- Aperturas con mancuernas — horizontal shoulder/chest movement.

After the template survives these different geometries, extend the same system to Pájaros con mancuernas and Pullover con mancuerna, then continue by batches.

## Future fullscreen viewer

The future library viewer should open the exercise visual at large size while keeping name, muscles, protocol and actions in surrounding application UI. The image itself remains untouched and text-free. The 1280×1600 generation master exists specifically to preserve quality for this and other high-resolution contexts without changing the visual system later.
