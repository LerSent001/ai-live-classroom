import type { SceneId } from "@/lib/classroom-types";

export type WaitingHandoff = Readonly<{
  kind: "waiting";
  finishedSceneId: SceneId;
  nextSceneId: SceneId;
}>;

export type ReadyHandoff = Readonly<{
  kind: "activate";
  finishedSceneId: SceneId;
  nextSceneId: SceneId;
}>;

export function beginHandoff(input: {
  finishedSceneId: SceneId;
  nextSceneId: SceneId;
  mediaReady: boolean;
}): WaitingHandoff | ReadyHandoff {
  return {
    kind: input.mediaReady ? "activate" : "waiting",
    finishedSceneId: input.finishedSceneId,
    nextSceneId: input.nextSceneId,
  };
}

export function mediaReady(
  handoff: WaitingHandoff | null,
  sceneId: SceneId,
): ReadyHandoff | null {
  if (!handoff || handoff.nextSceneId !== sceneId) {
    return null;
  }
  return {
    kind: "activate",
    finishedSceneId: handoff.finishedSceneId,
    nextSceneId: handoff.nextSceneId,
  };
}
