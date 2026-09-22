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

## Canonical identity reference

System v1 is anchored to the already approved IBERFIT male reference, not to a new interpretation:

- master ID: `IBERFIT_MALE_MASTER_V1`;
- identity reference: `public/iberfit/master/IBERFIT_MALE_MASTER_V1/front-master-v1.jpg`;
- approved branded reference: `public/iberfit/master/IBERFIT_MALE_MASTER_V1/front-master-v1-isotipo.jpg`;
- official isotipo: `public/isotipo-iberfit.png`.

Their SHA-256 values are pinned in `contract.json` and checked against the approved master metadata. Any intentional replacement of athlete identity or official isotipo requires a new versioned visual-system decision; silent drift is not allowed.

## Separation of responsibilities

### The asset owns

- movement depiction;
- movement phases;
- athlete/mannequin identity;
- equipment and support geometry;
- premium environment;
- required-by-default anatomical inset;
- exact official shirt isotipo;
- one restrained official isotipo wall watermark when the gym background provides a suitable surface.

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

The approved historical identity reference is 768×960 and is used as the locked identity/style reference; new exercise generation masters must meet the higher 1280×1600 minimum.

## Composition grid

### Primary movement field

The athlete and movement occupy the dominant central field. All relevant joints, hands, feet, external load, benches, bars, cables or ground contacts must be visible.

### Movement phases

When two phases are needed, start and end must share athlete, outfit, camera, equipment, environment and lighting. Only the movement changes. They may be presented side-by-side or in another approved deterministic composition, but never require baked labels to be understood.

### Anatomy zone

A compact anatomy inset is required by default for every new system-v1 exercise visual. The only exception is a QA-documented case where the inset would reduce instructional clarity.

Place it in the upper-left visual zone, normally at approximately 12–16% of image width. It must remain clearly secondary to the exercise and must never cover the athlete, load, support surface or trajectory.

The anatomy should read as a clean analytical anatomical plate rather than a bodybuilding illustration: restrained relief, subtle muscle definition, anatomically legible forms and no hyper-defined musculature. Use one or two neutral anatomical views only when they improve understanding; avoid decorative arcs, badges, marks or other ornamental elements inside the anatomy inset.

Primary muscles use the IBERFIT technical/deep green as the strongest anatomical emphasis. Secondary muscles, when useful, use restrained gold. Remaining anatomy stays neutral cream/grey at low contrast. No text labels are rendered into the inset.

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
- A single subtle wall watermark may be used in the premium gym background and is the preferred environmental brand treatment when a clean wall/background plane exists.
- Shirt mark and wall watermark must both use the exact repository asset `public/isotipo-iberfit.png`; they are composited deterministically after generation and never drawn or approximated by AI.
- The wall watermark stays visually subordinate: upper/right background zone, normally 18–26% of image width and approximately 6–12% opacity, never crossing the athlete, anatomy inset, equipment trajectory or other biomechanically important content.
- No standalone top/corner logo, no IBERFIT wordmark inside the asset, no repeated wall marks and no generated decorative brand mark.
- No equipment branding, dumbbell branding, shoe branding, shorts branding or invented symbols.
- If the source image contains an AI-generated or approximate IBERFIT mark anywhere, the candidate fails QA and must be cleaned/recomposed before approval.

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
6. exact official isotipo integrity on permitted placements only;
7. absence of standalone top/corner branding, wordmark, equipment/shoe branding or invented marks;
8. anatomy inset present, upper-left, analytical and consistently scaled unless a QA-documented exception applies;
9. background and color-system compliance;
10. absence of baked names, labels, instructions or UI text;
11. compact-size readability;
12. visual comparison with approved IBERFIT references;
13. human approval plus existing automated QA.

A failure in any mandatory gate blocks publication.

## Pilot before scale

The first system-v1 pilot should deliberately cover different movement families:

- Dominada pronada — vertical pull;
- Buenos días con barra — hip hinge;
- Aperturas con mancuernas — horizontal shoulder/chest movement.

After the template survives these different geometries, extend the same system to Pájaros con mancuernas and Pullover con mancuerna, then continue by batches.

## Future fullscreen viewer

The future library viewer should open the exercise visual at large size while keeping name, muscles, protocol and actions in surrounding application UI. The image itself remains untouched and text-free. The 1280×1600 generation master exists specifically to preserve quality for this and other high-resolution contexts without changing the visual system later.
