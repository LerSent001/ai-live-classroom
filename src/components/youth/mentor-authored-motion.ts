import { AnimationClip, AnimationMixer, AnimationUtils, LoopOnce, MathUtils, Quaternion, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack, type Object3D } from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMHumanoid, type VRMHumanBones, type VRMHumanBoneName } from '@pixiv/three-vrm';
import { VRMAnimationLoaderPlugin, createVRMAnimationHumanoidTracks, type VRMAnimation } from '@pixiv/three-vrm-animation';
import { createBackRest } from './mentor-back-rest';

// The supplied pack forbids extractable redistribution. Only the local preview
// loads it; the ignored directory must also be excluded from deployment uploads.
export const LOCAL_MOTION_ROOT = '/youth/local-motions/VRMA_MotionPack/vrma';
export const MOTION_CREDIT = "Animation credits to pixiv Inc.'s VRoid Project";
export const isLocalMotionHost = (host: string) => ['localhost', '127.0.0.1', '[::1]'].includes(host);

export function createPortraitHumanoid(model: Object3D, gltf: Pick<GLTF, 'scene'> & { parser: Pick<GLTF['parser'], 'json' | 'associations'> }) {
  const bones: Partial<VRMHumanBones> = {};
  const definitions = gltf.parser.json.extensions.VRM.humanoid.humanBones as { bone: string; node: number }[];
  for (const { bone, node } of definitions) {
    // VRM 0's thumb names differ from the normalized VRM 1 vocabulary.
    const name = bone.replace(/ThumbProximal$/, 'ThumbMetacarpal').replace(/ThumbIntermediate$/, 'ThumbProximal') as VRMHumanBoneName;
    let original: Object3D | undefined;
    gltf.scene.traverse(object => { if (gltf.parser.associations.get(object)?.nodes === node) original = object; });
    const target = original && model.getObjectByName(original.name);
    if (target) bones[name] = { node: target };
  }
  if (!bones.hips || !bones.head || !bones.leftHand || !bones.rightHand) throw new Error('Incomplete portrait humanoid');
  model.updateMatrixWorld(true);
  const humanoid = new VRMHumanoid(bones as VRMHumanBones);
  model.add(humanoid.normalizedHumanBonesRoot);
  return humanoid;
}

export function retargetMotion(animation: VRMAnimation, humanoid: VRMHumanoid, name: string) {
  const tracks = createVRMAnimationHumanoidTracks(animation, humanoid, '0');
  for (const side of ['left', 'right'] as const) {
    const track = tracks.rotation.get(`${side}UpperArm`);
    if (track) tracks.rotation.set(`${side}UpperArm`, addSleeveClearance(track, side));
  }
  return new AnimationClip(name, animation.duration, [...tracks.rotation.values(), ...tracks.translation.values()]);
}

export function addSleeveClearance(source: QuaternionKeyframeTrack, side: 'left' | 'right') {
  // Fit the existing motion to this flared dress. Only hanging upper arms need
  // outward clearance; raised greeting hands and every finger curve stay authored.
  // Bake into a cloned track, not per-frame offsets which can accumulate at rest.
  const track = source.clone();
  const q = new Quaternion(), offset = new Quaternion(), direction = new Vector3();
  const sign = side === 'left' ? -1 : 1;
  const axis = new Vector3(0, 0, 1);
  for (let i = 0; i < track.values.length; i += 4) {
    q.fromArray(track.values, i);
    direction.set(sign, 0, 0).applyQuaternion(q);
    const weight = MathUtils.smoothstep(-direction.y, .4, .9);
    offset.setFromAxisAngle(axis, sign * .19 * weight);
    q.premultiply(offset).normalize().toArray(track.values, i);
  }
  return track;
}

export function stillFromClip(clip: AnimationClip) {
  // An authored neutral frame, not a hand-built arm pose. Keep all finger tracks.
  return new AnimationClip('authored-rest', 1, clip.tracks.map(track => {
    const value = Array.from(track.values.slice(0, track.getValueSize()));
    const Track = track instanceof QuaternionKeyframeTrack ? QuaternionKeyframeTrack : VectorKeyframeTrack;
    return new Track(track.name, [0, 1], [...value, ...value]);
  }));
}

export async function loadPortraitMotions(humanoid: VRMHumanoid) {
  const loader = new GLTFLoader().register(parser => new VRMAnimationLoaderPlugin(parser));
  const load = async (id: string, name: string) => {
    const gltf = await loader.loadAsync(`${LOCAL_MOTION_ROOT}/VRMA_${id}.vrma`);
    const animation = gltf.userData.vrmAnimations?.[0] as VRMAnimation | undefined;
    if (!animation) throw new Error(`Missing authored motion: ${name}`);
    return retargetMotion(animation, humanoid, name);
  };
  const [greeting, modelPose] = await Promise.all([load('02', 'greeting'), load('06', 'model-pose')]);
  // Greeting contains a crouch/jump entrance. For a bust overlay use its authored
  // standing wave section, retaining original rotations and finger animation.
  const wave = AnimationUtils.subclip(greeting, 'greeting', 90, 195, 30);
  const restHips = humanoid.normalizedRestPose.hips?.position;
  if (!restHips) throw new Error('Missing normalized hips rest position');
  for (const clip of [wave, modelPose]) {
    for (const track of clip.tracks) {
      if (!(track instanceof VectorKeyframeTrack)) continue;
      const firstY = track.values[1];
      for (let i = 0; i < track.values.length; i += 3) {
        // Root-lock the overlay; keep the small authored vertical weight shifts.
        track.values[i] = restHips[0];
        track.values[i + 1] += restHips[1] - firstY;
        track.values[i + 2] = restHips[2];
      }
    }
  }
  return { greeting: wave, modelPose };
}

export function createMotionPlayer(model: Object3D, humanoid: VRMHumanoid, clips: Awaited<ReturnType<typeof loadPortraitMotions>>) {
  const mixer = new AnimationMixer(model);
  const rest = mixer.clipAction(createBackRest(humanoid, stillFromClip(clips.modelPose))).play();
  rest.paused = true;
  const actions = { greeting: mixer.clipAction(clips.greeting), 'model-pose': mixer.clipAction(clips.modelPose) };
  let current: keyof typeof actions | null = null;
  let elapsed = 0;
  const blend = .65;
  const update = (delta: number) => {
    if (current) {
      elapsed += delta;
      const action = actions[current];
      const duration = action.getClip().duration;
      const edge = Math.max(0, Math.min(1, elapsed / blend, (duration - elapsed) / blend));
      const weight = edge * edge * (3 - 2 * edge);
      action.setEffectiveWeight(weight);
      rest.setEffectiveWeight(1 - weight);
      if (elapsed >= duration) { action.stop(); current = null; rest.setEffectiveWeight(1); }
    }
    mixer.update(delta);
    humanoid.update();
    return current;
  };
  update(0);
  return {
    play(name: keyof typeof actions) {
      if (current) actions[current].stop();
      current = name; elapsed = 0;
      const action = actions[name].reset().setLoop(LoopOnce, 1).setEffectiveWeight(0).play();
      action.clampWhenFinished = true;
    },
    update,
    stop() { for (const action of Object.values(actions)) action.stop(); current = null; rest.setEffectiveWeight(1); update(0); },
    dispose() { mixer.stopAllAction(); mixer.uncacheRoot(model); model.remove(humanoid.normalizedHumanBonesRoot); },
  };
}
