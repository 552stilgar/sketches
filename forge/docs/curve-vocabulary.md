# Curve vocabulary — craft-loop reference sheet

Shared vocabulary for live shape direction. Primitives: `bend(p0,p1,sagitta)` ·
`sweep(spine,widthFn)` · `taper(spine,w0,w1,ease)` · `collar(spine,t,w,h)`.
`t` = fraction along spine (0=root,1=tip); `sagitta` = bow height, sign = bulge direction.

## Named moves

| name | reads as | primitive recipe |
|---|---|---|
| S-curve blade | scimitar/saber elegance, cutting draw | `bend(guard,mid,+sag) + bend(mid,tip,-0.55·sag)` (opposed sagittas) |
| Drop-tip sweep | falchion/yatagan, weight forward for chop | `sweep(spine, w peaks t=0.6-0.75) + bend(0.8,1.0,-sag)` (tip hooks down) |
| Distal taper | classic straight sword, balanced/agile | `taper(w0→0.5·w0, easeOutQuad)` full-length, no bend |
| Ricasso hold | unsharpened flat root (Type XIX, rapiers) | `taper` frozen at `w0` for `t<0.12`, then normal taper begins |
| Acute thrust point | armor-piercing, precise, cold | `taper(w_mid→0.05·w0, easeIn)` over final 15-20% — accelerating, not linear |
| Leaf-blade belly | broad cutting belly (kopis/falcata) | `sweep(spine, widthFn peaks ~1.3·w0 at t=0.4, falls to point)` |
| Clip-point tip | fast, aggressive point off a wide blade | `bend(0.85,1.0,+sag)` shear-plane feel — bend the last segment, don't just taper it |
| Round/spatulate tip | blunt, safe, ceremonial | `taper(...,w1≈0.3·w0)` then cap with `collar(spine,t=1.0,w=w1,h≈w1·0.4)` (rounds the vertex) |
| Swell-and-choke grip | hand-filling, ergonomic, "waisted" | two stitched tapers: `taper(root→mid, w0→0.7·w0) + taper(mid→tip, 0.7·w0→w0)` |
| Barrel grip | training/utilitarian, no waist | `sweep(grip_spine, widthFn flat-topped bulge, no pinch)` |
| Flared pommel collar | weight-anchor, punctuates the hilt end | `collar(spine, t=1.0, w=1.8·grip_w, h=0.5·grip_w)` |
| Ferrule collar | crisp material transition (grip→guard) | `collar(spine, t=0.0 of grip, w≈1.1·grip_w, h≈0.15·grip_len)` — thin, tight |
| Curled quillon (forward) | protective, blade-catching, martial | `bend(guard_root,quillon_tip,+sag)` curl toward blade (concave to attacker) |
| Curled quillon (back) | ornamental, swept-hilt, showy | `bend(guard_root,quillon_tip,-sag)` curl toward pommel |
| Swept knuckle-bow | hand-guarding complexity, rapier/side-sword | large-radius `bend(guard,pommel,+sag)` spanning the whole grip length |
| Bearded undercut | hooking reach, "Dane axe" identity | `bend(edge_heel,beard_tip,-sag)` steep downward hook, sag ≈ 0.3-0.5·head_w |
| Broad-bit flare | pure chopping mass, wide arc | `sweep(head_spine, widthFn expands linearly edge-ward, no taper-back)` |
| Dane-axe crescent | full sweeping edge, both horns extended | `bend(toe,heel,+sag)` symmetric, sag ≈ 0.4-0.6·head_w, both ends flared |
| Haft ergonomic curve | comfort grip, implies motion/swing | `bend(butt,head,+sag)`, sag small (≈0.03-0.08·haft_len) — subtle, don't overdo |
| Langet strap taper | reinforced, high-status, poleaxe-like | `taper(head_collar→down_haft, w0→0.3·w0, easeOutCubic)` thin strap, short run |
| Eye/haft collar | structural transition, head-to-haft joint | `collar(spine, t=head_junction, w≈1.15·haft_r, h≈0.3·head_w)` |
| Poll spike | back-of-head threat accent | `taper(poll_root→poll_tip, w0→~0, easeIn)` short, steep |

## Shape rules of thumb

- **Curve = elegance/organic/civilized; straight = brutal/industrial/martial.** The *ratio* of bend-driven silhouette to flat taper-driven silhouette is the single strongest class signal — lean it deliberately, don't blend everything into a soft middle.
- **Contrast curve direction.** Two consecutive bends bowing the same way read as one lazy arc; opposing sagittas (S-curve blade, swept quillon vs undercut beard) read as tension and intent.
- **Mass rhythm: big → medium → small.** One dominant mass (blade/axe-head), 1-2 supporting masses (guard/collar), then small accents (fuller, wrap bands, langets) at roughly 3-5x decreasing visual weight each step. Never let a "small" accent (wrap band, engraving) compete with the primary bend.
- **Tip emphasis via ease, not just width.** `easeIn` (accelerating) tapers read sharp/dangerous; `easeOut` (decelerating into a plateau) reads blunt/safe. The last 10-20% of a spine is where the reader's eye lands first — spend deliberate taper/bend budget there.
- **Negative space beats added mass.** A `collar` that pulls material away (ring guard gap, beard hook undercut, langet standoff) reads stronger at silhouette distance than an equivalent bump added via `sweep`. Prefer carving gaps over piling on shapes when a part needs to "read."
- **One line of action per piece.** Pick a single dominant bend (the haft's overall sweep, or the blade's primary curve) and make every other bend/collar subordinate to it — a second bend at similar magnitude fights the first and muddies the silhouette instead of adding complexity.
- **Silhouette-first, primitives second.** Block the big `taper`/`bend` pass and check it filled solid black before layering `collar`/secondary `sweep` detail — if the fill doesn't read the class (sword vs axe) at a glance, no amount of surface detail fixes it.

## Class vocabulary

**Sword** — identity lives in the *blade curve + taper* and the *hilt punctuation*: S-curve blade or distal taper (pick one, not both) → acute or round tip via ease choice → swell-and-choke or ferrule-collar grip → curled quillon (direction = protective vs ornamental) → flared pommel collar as the terminal accent.

**Axe** — identity lives in the *head sweep + haft line*: broad-bit flare or bearded undercut or Dane crescent (pick the head's signature move) → eye/haft collar as the structural anchor → subtle haft ergonomic curve (don't overdo — axes read brutal via straight lines more than sword hilts do) → langet taper or poll spike as the optional high-status/threat accent.

## Sources

- forge internal: `docs/v6-research.md` — Oakeshott blade typology (cross-section/taper/fuller/point vocabulary), historical hilt anatomy (quillons/wrap/pommel types), axe anatomy (bearded/broad/Dane axe, cheeks, langets, eye-collar)
- [Shape Language in Video Games: Character Design](https://ejaw.net/shape-language-in-character-design/) — curve=safe/friendly vs angular=danger/aggression; tip emphasis as visual arrow
- [Shape Language in Game Design & Animation — Pixune](https://pixune.com/blog/shape-language-technique/) — circle/square/triangle emotional-tone baseline
- [Exploring the Big Medium Small Theory — ArtStation](https://www.artstation.com/blogs/htartist/mVg2/exploring-the-big-medium-small-theory-in-design-for-games-and-films) — big/medium/small mass-rhythm hierarchy
- [Bearded axe — Wikipedia](https://en.wikipedia.org/wiki/Bearded_axe); [What is a Dane Axe? — Awesome Axes](https://www.awesomeaxes.com/what-is-a-dane-axe/) — bearded undercut vs Dane crescent silhouette distinction
- [Sculpting & Texturing a Stylized Sword — 80.lv](https://80.lv/articles/001agt-sculpting-texturing-a-stylized-sword) — stylized exaggeration/simplification approach
- [Blade Shapes and Geometry — Atkinson Swords](http://atkinson-swords.com/sword-making-and-decoration/sword-shape/) — forward/backward curve classification, point profile vocabulary
