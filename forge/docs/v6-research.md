# forge v6 — geometry-depth research

Research lane output for the v6 build (blade / hilt / axe geometry-depth lanes). Read-only pass over
`params.mjs` (44-gene DNA table) and `index.html` (SCENE shader — `mapSword` / `mapAxe` / `map`).
No code changed by this lane; this doc is the only artifact.

---

## 1. Existing DNA — all 44 genes

Read in full from `params.mjs`. Order is the PRNG-roll contract (append-only, never reorder/insert).

| # | key | section | kind | range/options |
|---|---|---|---|---|
| 1 | weapon_class | Class | options | sword, axe |
| 2 | blade_type | Blade | options | arming, longsword, falchion, scimitar, leaf, estoc |
| 3 | blade_len | Blade | range | 0.70–1.30 |
| 4 | blade_w | Blade | range | 0.045–0.115 |
| 5 | blade_taper | Blade | range | 0.15–0.90 |
| 6 | blade_curve | Blade | range | 0.0–0.30 |
| 7 | fuller_n | Blade | options | 0, 1, 2 |
| 8 | fuller_depth | Blade | range | 0.15–0.60 |
| 9 | tip_style | Blade | options | point, clip, round |
| 10 | guard_type | Guard | options | bar, quillons, disc, crescent |
| 11 | guard_span | Guard | range | 0.14–0.34 |
| 12 | guard_thick | Guard | range | 0.018–0.042 |
| 13 | guard_droop | Guard | range | -0.35–0.55 |
| 14 | grip_len | Grip | range | 0.14–0.34 |
| 15 | grip_r | Grip | range | 0.022–0.038 |
| 16 | wrap_bands | Grip | options | 0, 3, 4, 5, 6, 7, 8 |
| 17 | pommel_type | Grip | options | disc, sphere, scent_stopper, faceted, ring |
| 18 | pommel_r | Grip | range | 0.035–0.065 |
| 19 | haft_len | Haft | range | 0.60–1.25 |
| 20 | haft_r | Haft | range | 0.020–0.036 |
| 21 | haft_curve | Haft | range | 0.0–0.14 |
| 22 | haft_wrap | Haft | options | 0, 1 |
| 23 | head_type | Head | options | bearded, broad, double_bit, war |
| 24 | head_w | Head | range | 0.16–0.34 |
| 25 | edge_sweep | Head | range | 0.25–0.95 |
| 26 | beard_depth | Head | range | 0.0–0.55 |
| 27 | cheek_thick | Head | range | 0.028–0.060 |
| 28 | poll_type | Head | options | flat, hammer, spike |
| 29 | head_drop | Head | range | 0.02–0.10 |
| 30 | steel_hue | Material | range | 185–235 |
| 31 | steel_sat | Material | range | 2–16 |
| 32 | accent_on | Material | options | 0, 1 |
| 33 | accent_hue | Material | range | 22–48 |
| 34 | light_az | Lighting | range | -80–80 |
| 35 | light_el | Lighting | range | 15–65 |
| 36 | steel_finish | Material | options | brushed×2, damascus, blued |
| 37 | wear_amount | Material | range | 0.0–1.0 |
| 38 | damascus_scale | Material | range | 18–60 |
| 39 | damascus_warp | Material | range | 0.15–0.85 |
| 40 | metal_family | Material | options | steel×3, iron, bronze |
| 41 | grip_material | Grip | options | leather×2, cord, wire |
| 42 | guard_ext | Guard | options | inherit×2, swept, ring |
| 43 | engrave_on | Detail | options | 0×3, 1 |
| 44 | engrave_density | Detail | range | 0.30–1.00 |

**Geometry genes** (drive the SDF, as opposed to color/finish): weapon_class, blade_type, blade_len,
blade_w, blade_taper, blade_curve, fuller_n, fuller_depth, tip_style, guard_type, guard_span,
guard_thick, guard_droop, guard_ext, grip_len, grip_r, wrap_bands, pommel_type, pommel_r, haft_len,
haft_r, haft_curve, haft_wrap, head_type, head_w, edge_sweep, beard_depth, cheek_thick, poll_type,
head_drop. Everything from `steel_hue` down is material/lighting only (`deriveMaterial` +
`surfaceMat` in the shader) and out of scope for this geometry-depth pass.

---

## 2. Expression-gap audit (shader-level)

Read the full `SCENE` GLSL chunk in `index.html` (`mapSword` ~L245-329, `mapAxe` ~L331-389). Per-gene
verdict below — what the shader literally does today vs. a concrete SDF-level fix. Line numbers are
approximate anchors in the current file.

| gene | part | currently in the shader | concrete fix |
|---|---|---|---|
| `fuller_depth` | blade | `th *= 1.0 - 0.55*groove` (L258-264) — thins the diamond cross-section's z-extent by a smoothstep-in-x mask. It IS real 3D geometry (normals do crease), but capped at 55% thickness loss and shaped like a flat V-notch, not a channel — reads as a shading crease more than a forged groove, especially at range. | Replace the thickness scalar with a real smooth-subtraction (`smin`-style) of an elongated capsule/lozenge running the fuller's length along the blade midline (or two, mirrored, for `fuller_n=2`), so the groove gets its own rounded floor and visible rim highlight instead of just squeezing the existing diamond. |
| `blade_taper` | blade | `wProf = 1.0 - taper*t` (L251) — single global linear ramp from guard to tip; well expressed as the primary silhouette wedge, but has no way to represent a flat, un-tapered root section before the taper begins. | Pair with the new `ricasso_len` gene below: freeze `wProf` at 1.0 for the first `ricasso_len` fraction of blade length, then begin the existing taper — gives blades a real flat root strip (rapier/estoc/longsword ricasso) instead of tapering from the very first millimeter off the guard. |
| `tip_style` | blade | `point` and `round` both reuse the identical `tipMul` taper-to-zero curve (L253-254), differing only by a `sqrt()` exponent — the tip silhouette is still a hard diamond vertex in both cases; only `clip` (L276-280, a shear-plane cut) is a genuinely distinct shape. | For `round`, smooth-union a small sphere at the exact tip vertex (radius ≈ `w * 0.4`) instead of just accelerating the width falloff, so the point silhouette actually rounds off rather than merely arriving at zero width faster. |
| `guard_droop` | hilt | Only consumed by `guard_type == quillons` (L299-301, straight capsule angle) and `guard_ext == swept` (L294-296, rear quillon angle). For `bar`, `disc`, `crescent` (3 of 4 base types) the rolled value has **zero visual effect** — a dead draw for a large share of sword hashes. | Give `bar` a droop-driven rake/twist (rotate the box around its long axis by `droop`), and give `disc`/`crescent` a droop-driven tilt of the guard plane, so every `guard_type` branch consumes the same roll instead of silently discarding it. |
| `pommel_type = faceted` | hilt | `sdOcta(pp, r*1.25)` (L217-220, L325) — a fixed regular octahedron; every "faceted" pommel across every hash is geometrically identical. | Parameterize facet count via the new `pommel_facets` gene: fold the azimuth angle by `2π/facets` (hg_sdf `pModPolar`-style) and intersect with tilted planes, so faceted pommels range from a hexagonal brazil-nut-like block to a many-faceted wheel-pommel look. |
| `beard_depth` | axe | Dampened outside `bearded`: `head_type=='bearded' ? max(depth,0.18) : depth*0.4` (L1026 in the JS uniform wiring) — for the other 3 head types more than half the rolled 0–0.55 range collapses into a sub-0.22 hook that's barely distinguishable from "no beard." Historically only bearded axes have a beard at all. | Gate the beard hook fully to `head_type=='bearded'` (0 elsewhere) and spend the reclaimed roll headroom on a type-appropriate feature instead — e.g. drive `war` axes' poll spike length or `double_bit` asymmetry with the freed-up draw rather than a fake partial beard on types that shouldn't have one. |
| `poll_type` | axe | Poll branch is skipped outright for `double_bit`: `if (u_headType < 1.5 || u_headType > 2.5)` (L377) — `poll_type` is rolled every hash but has **zero effect on ~25% of axes** (double_bit is 1 of 4 uniform head_type options). | Repurpose `poll_type`'s roll for double-bit axes to drive asymmetry between the two bits (offset `edge_sweep`/`edgeReach` per side) — real double-bits are rarely perfectly symmetric — instead of leaving the draw dead. |
| `wrap_bands` | hilt | `gr += 0.0035 * sin(p.y/gripLen*bands*2π)` (L313-315) — amplitude 0.0035 against a grip radius of 0.022-0.038 is a ~10-15% ripple, essentially invisible under normal lighting/AO. Separately, the grip's actual *visible* banding (leather/cord/wire patterns in `surfaceMat`, L570-583) uses its own hardcoded frequency (230/420) totally decoupled from this gene — the DNA param that's supposed to set "how many wraps" doesn't match what you see. | (a) Raise the geometric ripple amplitude and square its profile so it reads as raised cord ridges, not a sine sheen; (b) thread `u_wrapBands` into `surfaceMat`'s cord/wire frequency terms so the rolled count and the rendered band count are the same number. |
| `haft_wrap` | axe | Binary flag nudges `hr` by `0.004*band*sin(p.y*260)` at two fixed windows (L337-340) — ~15% of `haft_r` at best, imperceptible at render distance, and doesn't touch `surfaceMat`'s wood-grain response at all, so a "wrapped" haft looks identical to a bare one. | Union a distinct `MAT_GRIP`/`MAT_ACCENT` cord geometry at the two grip points (same treatment the sword grip already gets) instead of perturbing the wood SDF radius, so wrapped haft sections read as a genuinely different material band. |
| `cheek_thick` | axe | `thick = mix(cheek_thick, 0.004, sx)` clamps a flat plane, `abs(h.z) - thick` (L368-369) — purely a uniform slab thickness tapering to a fixed thin edge; no face modeling at all (always flat). | Pair with the new `cheek_profile` gene: replace the flat-plane clamp with a radial bow function (concave = hollow-ground hewing axe face, convex = forged bulge) so cheeks pick up real surface curvature instead of being a plain slab. |
| `guard_ext` (reference point) | hilt | Genuinely well-expressed already — `swept` builds a real knuckle-bow torus clipped to its forward half plus a rear quillon capsule (L290-296), `ring` builds a crossbar + parry-ring torus (L285-289). Distinct silhouettes, not just a color/label change. | No fix needed — this is the shader's best example of "new gene → new primitive," and is the pattern the new hilt genes below (`quillon_tip`, `guard_shell`) should copy rather than reusing `guard_droop`'s thinner "modulate an existing scalar" approach. |
| `fuller_n` (positive note) | blade | Actually well-designed: `fuller_n==2` genuinely places two independent off-center grooves via `abs(abs(q.x) - w*0.38)` (L259), not just a repeated single groove — this is correct groove-count geometry, the shortfall is purely `fuller_depth`'s shallow channel shape (see above), not the count logic. | No separate fix; folded into the `fuller_depth` groove rework above. |

---

## 3. Research: typology, anatomy, SDF craft

### 3a. Oakeshott sword typology — blade profile vocabulary

Oakeshott's system (Ewart Oakeshott, ~1050-1550 CE coverage) classifies blades by **cross-section,
taper, fuller length/width, and point shape** — exactly the axes forge's existing genes already touch,
but the shader currently gives every blade the same rhombic cross-section regardless of type.

- **Type X**: broad flat blade, wide-but-shallow fuller running almost full length, fading before a
  rounded point. Cutting-oriented.
- **Type XI**: longer/more slender than X, narrower fuller nearly full-length, tapers to an acute point.
- **Type XII**: more taper, shorter fuller (terminating ~2/3 down) — early thrust/cut compromise.
- **Type XIII**: long, wide, near-parallel edges, rounded/spatulate tip, **lenticular** cross-section,
  minimal taper — a big broad cutter.
- **Type XIV**: short/broad, sharply tapering, flat section, fuller ~half-length, acute triangular
  profile.
- **Type XV**: straight tapering blade, **diamond** cross-section, sharp thrusting point — no fuller;
  built to defeat plate armor gaps.
- **Type XVI**: flat cutting blade tapering to an acute point with a reinforcing ridge (a slender XIV
  variant, cut/thrust hybrid).
- **Type XVII**: long, evenly-tapering, **hexagonal** cross-section, two-handed grip — stiff
  armor-piercing thruster.
- **Type XVIII**: broad base tapering to a point, short grip, diamond cross-section with a raised
  mid-rib; subtype XVIIIc explicitly called out as flattened-diamond.
- **Type XIX** (just past the researched range): known for a **pronounced ricasso** — an unsharpened
  flat root section just below the guard, sometimes gripped with a gloved "finger over the guard."

Takeaway for forge: cross-section shape (flat/lenticular/diamond/hexagonal) and ricasso presence are
the two biggest Oakeshott-legible features the shader doesn't express yet — hence `blade_section` and
`ricasso_len` below.
Sources: [Oakeshott typology — Wikipedia](https://en.wikipedia.org/wiki/Oakeshott_typology),
[Introduction to Oakeshott's Sword Typology — ARMA](https://www.thearma.org/spotlight/oakeshott_typology.html),
[Oakeshott Typology Made Easy](https://www.sword-buyers-guide.com/oakeshott-typology.html),
[Oakeshott Typology — Wiktenauer](https://wiktenauer.com/wiki/Oakeshott_Typology)

### 3b. Historical hilt anatomy — quillons, guards, wraps, pommels

- **Crossguard/quillons**: the two projecting limbs of the guard. **Straight** crossguard = simplest,
  best raw parry; **curved** crossguards curl toward the blade or pommel for better blade-catching;
  later **swept-hilt** guards add knuckle-bows and side rings (this is exactly what forge's
  `guard_ext=swept/ring` already models at the whole-guard level — but individual quillon curvature and
  tip treatment are still unmodeled, hence `quillon_curl` / `quillon_tip` / `guard_shell` below).
- **Wire-wrapped grips**: grips were built from wood/leather/bone cores with cord or wire wound in a
  helical wrap, sometimes with raised **risers** (fluted ridges) under the wrap for hand purchase, and a
  metal **ferrule** collar where the grip meets the guard to protect the organic wrap from splitting.
- **Pommel types** (Oakeshott's own A-Z pommel classification, separate from blade typology):
  - **Brazil-nut**: tri-lobed, Viking-derived, common 950-1250 CE.
  - **Wheel/disc**: flat circular disc, the dominant high-medieval form.
  - **Scent-stopper**: tapering faceted cone (named for a perfume-bottle stopper), first seen early
    14th c., common after 1360.
  - **Fishtail**: 15th-century, split/forked silhouette (V1/V2 subtypes).
  - Also documented: oblate spheroids, crescents, faceted/multi-sided forms, animal-head forms.
  - Forge already has 5 `pommel_type` options mapping to distinct primitives (disc/sphere/scent_stopper
    as a tapered cone/faceted octahedron/ring torus) — reasonably faithful, but "faceted" is locked to a
    fixed 8-face octahedron with no facet-count variation (see gap table above → `pommel_facets`).

Sources: [Hilt — Wikipedia](https://en.wikipedia.org/wiki/Hilt),
[18 Types of Pommels on Medieval Swords — swordis.com](https://swordis.com/blog/types-of-pommels/),
[Anatomy of a Blade — Knights Templar](https://knightstemplar.co/anatomy-of-a-blade-exploring-the-parts-of-a-medieval-sword/),
[Sword Hilt Types and Guards — swordis.com](https://swordis.com/blog/sword-hilt/)

### 3c. Axe anatomy — bearded vs. broad, langets, cheeks, poll

- **Poll/butt**: flat (or hammer/spike-equipped) back face opposite the bit — forge's `poll_type`
  already covers flat/hammer/spike, but see the double-bit dead-roll gap above.
- **Cheeks**: the flat sides of the head, acting as a counterweight; historically these vary — "flat,
  curved, have spines, grooves, flared ramps, or cut-out bevels" — forge's `cheek_thick` only ever
  produces a flat slab (see gap table → `cheek_profile`).
- **Beard**: the lower part of the bit that sweeps down toward the haft — the defining feature of
  **bearded axes** (long beard = "bearded"/"Dane" axe, historically for hooking and extended cutting
  reach); **broad axes** are noted specifically for a *long beard used in hewing* — i.e. broad axes
  legitimately want a beard too, which cuts slightly against forge's current bearded-only weighting
  (folded into the `beard_depth` gap entry above).
- **Langets**: metal straps extending from the head down the haft, reinforcing it against overstrikes —
  present on poleaxes and higher-end axes, currently entirely unmodeled in forge (hence `langet_len`
  below).
- **Eye/haft-collar**: forge's `sdEye` collar (mapAxe L372-374) already models this.

Sources: [The Anatomy of an Axe — Brant & Cochran](https://www.bnctools.com/blogs/the-chop/the-anatomy-of-an-axe-unraveling-the-secrets-of-a-timeless-tool),
[Axe Morphology: From Eye to Throat — Skeeters](https://www.skeeters.ax/axe-morphology-from-eye-to-throat/),
[The Parts of an Axe — Timber Gadgets](https://timbergadgets.com/parts-of-an-axe/)

### 3d. SDF modeling craft — techniques applicable to the geometry-depth lanes

| technique | source | use for forge v6 |
|---|---|---|
| Smooth minimum / smooth union (`smin`) | [iquilezles.org/articles/distfunctions](https://iquilezles.org/articles/distfunctions/) | Blend the new capsule/torus/langet unions into the blade/head/haft with no hard seam — replace bare `min()` unions where a new part meets existing steel (fuller channel floor, ricasso shoulder, guard-shell junction). |
| Elongation (`opElongate`) | iquilezles.org distfunctions | "Splits a primitive, moves the pieces apart, connects them" at exact distance — good fit for `ricasso_len` (stretch a flat capped-box root section) and `langet_len` (stretch a thin strap down the haft) without re-deriving a new SDF per length. |
| Domain repetition / `pModPolar` | [hg_sdf](https://mercury.sexy/hg_sdf/), [iquilezles.org/articles/sdfrepetition](https://iquilezles.org/articles/sdfrepetition/) | Fold azimuth angle by `2π / facets` to generalize the fixed octahedron (`pommel_facets`) into an n-gon, and to build `grip_risers` as angular flutes around the grip capsule (as opposed to `wrap_bands`' existing lengthwise/radial-along-y ripple). |
| Revolution (`opRevolution`) | iquilezles.org distfunctions | Any new 2D silhouette (e.g. a spatulate/flared quillon tip cap, a haft butt-cap) can be authored as a 2D profile and revolved around the local axis rather than hand-built in 3D — cheaper to iterate the profile curve for craft tuning. |
| Extrusion (`opExtrusion`) | iquilezles.org distfunctions | Flat weapon elements (axe cheek face profile, guard shell/ring plate) are naturally a 2D SDF extruded along the thin axis — matches the existing `cheek_thick`/`abs(h.z)` pattern but with a real 2D profile instead of a constant. |
| Rounding (`opRound`) | iquilezles.org distfunctions | Subtract a uniform offset to soften any new hard-edged box/capsule union (quillon tip caps, ferrule collar, haft butt cap) so new parts don't read as CAD-primitive-sharp against the existing hand-tuned blade/guard silhouette. |
| Smooth boolean variants (`fOpUnionRound`, `fOpUnionChamfer`) | [hg_sdf](https://mercury.sexy/hg_sdf/) | Chamfered (flat bevel) vs. rounded unions give two distinct "forged" vs. "cast" junction feels — useful for distinguishing `metal_family` (bronze=cast=rounder joins, steel/iron=forged=chamfered) at the geometry level, not just via material color, if a future lane wants to push family further. |
| Curvature-aware SDF Laplacian (already in forge) | forge's own `calcCurv` (index.html ~L484-491) | Existing pattern for "convex edges polish, concave hollows grime" — any new groove/channel geometry (fuller rework, langets, cheek concavity) automatically inherits correct wear behavior for free once it's real 3D geometry instead of an albedo/roughness hack. |

---

## 4. Proposed new genes (13)

None of these keys collide with the 44 existing DNA keys. All are meant to **append** to the DNA table
(per the file's own "append only" contract) so every existing hash keeps its current rolls untouched;
the new draw simply lands at the end of the PRNG sequence. Following the v2/v4 convention already in the
file (`steel_finish`, `metal_family`, `guard_ext`, `engrave_on` all repeat their neutral/legacy option
2-3× so the *previously seen* look stays the statistically common case), every `options`-kind gene below
repeats its neutral/off value so the current baseline look dominates and the new variety is the visible
minority.

| key | section | part | kind | values | weight / rationale |
|---|---|---|---|---|---|
| `blade_section` | Blade | blade | options | `['diamond','diamond','diamond','lenticular','hollow_ground']` | `diamond` is the current fixed cross-section (`cs` formula, L273) — kept as 3/5 majority so most blades render exactly as today. `lenticular` softens the cross-section into a flattened oval (Oakeshott XIII); `hollow_ground` concave-fillets the flat between spine and edge (Bowie/Type-XV-adjacent look). Directly answers the Oakeshott finding that cross-section is the primary blade-type visual signal the shader currently ignores (every `blade_type` shares one cross-section today). |
| `ricasso_len` | Blade | blade | range | min 0.0, max 0.16, decimals 3 | Low end (0-0.02) is visually indistinguishable from "no ricasso," i.e. today's blades — only larger rolls introduce a visible flat, un-tapered root strip before `blade_taper` begins. Modeled on Type XIX's "pronounced ricasso" and rapier finger-over-guard grips. |
| `edge_bevel_w` | Blade | blade | range | min 0.05, max 0.40, decimals 2 | Fraction of the half-width given to a distinct edge-bevel facet vs. a flat unbeveled center — at the low end the blade reads as today's single-facet diamond; higher values carve a visible secondary bevel band near the edge, independent of the `blade_section` concavity (bevel width, not cross-section family). |
| `quillon_curl` | Guard | hilt | range | min -0.50, max 0.80, decimals 2 | 0 = today's straight quillon capsule (legacy look preserved at the range's zero point); negative curls the tip forward toward the blade, positive curls it back toward the pommel — matches the historical straight-vs-curved-vs-S-guard quillon spectrum that `guard_droop`'s simple angle can't produce (droop tilts the whole limb; curl bends the limb itself, quadratically like `blade_curve` does for the blade). |
| `quillon_tip` | Guard | hilt | options | `['ball','ball','ball','flare','spatulate']` | `ball` (a small end-cap sphere) is the closest match to the current bare-capsule-end look and stays the 3/5 majority; `flare` (a widening cone cap) and `spatulate` (a flattened disc cap) are visually rarer variants. Currently the guard's capsule/box ends are entirely uncapped — this closes that gap. |
| `guard_shell` | Guard | hilt | options | `[0,0,0,1]` | An additive forward-projecting ring/shell (small torus offset toward the blade) layered onto *any* `guard_type`/`guard_ext` base, distinct from `guard_ext=ring` which replaces the whole guard silhouette outright. 0 (off, 3/4 weight) matches every guard rendered today; 1 adds the shell as a side-detail, matching rapier/side-sword guard complexity without touching the base guard branch logic. |
| `grip_profile` | Grip | hilt | options | `['straight','straight','straight','waisted','barrel']` | `straight` (uniform-radius capsule) is exactly today's grip and stays the majority weight; `waisted` pinches the radius at grip mid-length (hourglass, common on wire-wrapped rapier grips), `barrel` swells it (training-grip look). Modulates `gr` by a `t`-based profile curve, the same technique already used for the blade's `wProf`. |
| `grip_risers` | Grip | hilt | options | `[0,0,0,4,6]` | Angular flutes around the grip circumference (`gr += ripple(atan(z,x)*risers)`), distinct axis from `wrap_bands`' existing lengthwise coil ripple — 0 (no risers, majority) matches today's smooth-in-cross-section grip; 4/6 add fluted ridges for hand purchase, a real historical grip-shaping feature currently entirely absent. |
| `ferrule_on` | Grip | hilt | options | `[0,0,0,1]` | A short metal collar (`sdCylY`, MAT_ACCENT) at the grip root where it meets the guard — 0 (off, majority) preserves today's bare grip-to-guard transition; 1 adds the collar seen on swept-hilt/messer designs, giving the grip a distinct metal fitting instead of organic material running straight into the guard. |
| `pommel_facets` | Grip | hilt | options | `[0,0,0,6,10]` | Only consumed when `pommel_type=='faceted'`. 0 keeps today's fixed `sdOcta` behavior (majority, so existing faceted pommels look unchanged); 6/10 generalize the octahedron into an n-gon via polar angle-folding, giving faceted pommels real facet-count variety (hexagonal brazil-nut-like vs. many-faceted wheel-pommel). |
| `langet_len` | Head | axe | range | min 0.0, max 0.28, decimals 2 | Low end (0-0.02) reads as today's bare eye-collar (no langets); higher rolls extend two thin steel strips from the collar down the haft. A real, currently entirely-unmodeled poleaxe/high-end-axe reinforcement feature identified directly from the anatomy research (3c). |
| `cheek_profile` | Head | axe | options | `['flat','flat','flat','concave','convex']` | `flat` matches today's `abs(h.z)-thick` slab exactly (majority weight, no change to most axes); `concave` bows the cheek face inward (hollow-ground hewing axe), `convex` bows it outward (forged bulge) — both driven by a radial-distance-from-eye profile function replacing the flat clamp identified in the `cheek_thick` gap entry. |
| `haft_butt` | Haft | axe | options | `[0,0,0,1]` | A flared cap/knob at the haft's base end — 0 (off, majority) matches today's bare capsule-end haft; 1 unions a small torus/disc cap (MAT_WOOD or MAT_ACCENT) for the two-handed-grip-retention butt seen on many broad/war axes, currently entirely absent from the haft SDF. |

---

## 5. Handoff notes for the geometry-depth lanes

- **Blade lane**: prioritize `blade_section` (biggest Oakeshott-legible silhouette/shading win) +
  `ricasso_len`, then the `fuller_depth` groove rework and `tip_style=round` fix from the gap table.
  `edge_bevel_w` is the lowest-priority of the three new blade genes (subtlest visual delta).
- **Hilt lane**: prioritize `quillon_curl` + `quillon_tip` (guard is currently the flattest-expressed
  part relative to its 4 `guard_type` + `guard_ext` options) and the `guard_droop` dead-roll fix, then
  `pommel_facets`, then grip genes (`grip_profile`/`grip_risers`/`ferrule_on`) which are lower-visual-
  weight but cheap wins once the grip capsule code is being touched anyway. Fix the `wrap_bands`
  amplitude/frequency mismatch in the same pass since it's grip-adjacent.
- **Axe lane**: prioritize `cheek_profile` (axe heads are currently the most "flat slab" geometry in the
  whole shader) + `langet_len`, then fix the `poll_type` double-bit dead-roll and the `beard_depth`
  overreach into non-bearded types, then `haft_butt` as a cheap finishing touch.
- All three lanes should reach for `smin`/`opElongate`/`pModPolar` (§3d) rather than hand-rolling new
  distance math — the existing shader already leans on plain `min()` unions (`opU`) for most part
  boundaries, which is the single biggest reason new parts will look "glued on" if the lanes don't
  smooth-blend the junctions.
