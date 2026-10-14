# VRoid material trial

HairSample_Female, VRoid Studio beta official sample, CC0.
Official terms: https://vroid.pixiv.help/hc/en-us/articles/4402614652569
Mirror: https://github.com/madjin/vrm-samples/blob/master/vroid/beta/HairSample_Female.vrm
Embedded VRM metadata also declares CC0. 27,068 triangles, 14 materials.
Local preview uses a relaxed-arm pose and lightweight toon materials, with intermittent
blinking and a gentle smile/head tilt. Expressions use the model's existing morph targets.
Localhost now loads the user-supplied official VRMA MotionPack (VRMA_02 Greeting,
VRMA_06 Model pose) through @pixiv/three-vrm and @pixiv/three-vrm-animation 3.5.4 (MIT).
Animation credits to pixiv Inc.'s VRoid Project.
The asset license is separate from the loader's MIT license and prohibits extractable
redistribution. The unmodified ZIP contents and notices are in the gitignored
public/youth/local-motions/ directory for LOCAL EVALUATION ONLY. Exclude that directory
from all deployment uploads as well; do not publish it without permission.
Non-local hosts do not request these files. Missing local files keep the fallback stance.
The greeting uses the authored 3–6.5s standing wave, omitting its crouch/jump entrance.
Root travel is removed to keep the overlay anchored; rotations and fingers are retargeted
with pixiv's normalized humanoid, including VRM 0 thumb mapping and coordinate conversion.
The body of the model-pose first frame provides the rest stance, with a user-requested
static hands-behind-back fit and relaxed finger curl. This fitted pose is not an authored
clip from the pack. Transitions blend over 0.65 seconds.
Dress-fit correction adds up to 0.19 radians of outward upper-arm clearance only when
the arm hangs down, fading to zero as it rises. This is baked into cloned retargeted
motion tracks; source VRMA files and their finger curves are untouched. Rest fingers use
separate mild proximal/intermediate/distal bends without lateral fan-out.
This model-specific clearance is not a general collision or cloth-physics solver.
Greeting plays once per page visit, then model pose plays with 10.5–13s rests between clips.
Reduced motion uses a still frame; hidden tabs pause without advancing or repeating greeting.
The prior hand-authored gestures remain disabled. No spring-hair or cloth simulation is claimed.
Local head-petting is a separate 1.2-second additive render-only reaction: closed eyes,
smile and restrained yaw. It restores bones/morphs after drawing so it does not accumulate
or overwrite the clip mixer. Pointer hits use character mesh raycasts; only head hits
activate petting. Empty canvas pixels do not become a rectangular button. Reduced motion
keeps the expression response without head rotation. The cloud anchors to the initial
projected head bounds with a 14px gap (above the head on narrow screens). Its position
stays fixed during gestures and petting, adapting only to viewport/layout changes.
Its first appearance is delayed 3 seconds after the portrait's first rendered frame.
Embedded textures were resized to at most 512px without altering geometry or licensing metadata.
Source 17,518,216 bytes; runtime file 5,667,820 bytes. The portrait uses demand rendering,
DPR capped at 1.25, no dynamic shadows, physics, or post-processing. Browser measurement
with the cel contour pass showed 240 draw calls / 52,328 rendered triangles. Motion updates
are scheduled at most 24 times per second during gestures, with no continuous loop between
gestures. Hidden pages and reduced-motion preferences pause gestures; entering playback
unmounts the portrait. Desktop and mobile browser checks verified blinking, smile/head tilt,
and zero additional frames while reduced motion was enabled. This is not a device heat,
battery, or sustained frame-rate benchmark.
The contour pass expands back faces, follows the skin skeleton, and skips eyes/mouth overlays.
Clothing keeps its original detail map with softened painted shading; hair colors are reduced
in the shader. Source textures remain intact. The portrait viewport extends downward behind
the controls to the screen edge, preserving the original head framing.
