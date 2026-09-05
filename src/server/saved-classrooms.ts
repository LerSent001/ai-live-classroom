import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { isRecord, parseLessonPlan, parsePlan, parseSegment, parseTeacherId, toClassroomSessionId, toSceneId } from "@/lib/classroom-boundaries";
import { CLASSROOM_CONFIG, DEMO_CONFIG } from "@/lib/classroom-config";
import { recordingTopicKey, type RecordedClassroom, type RecordedLesson, type SavedClassroomSummary } from "@/lib/saved-classroom";
import type { ClassroomSessionId, TeacherId } from "@/lib/classroom-types";

type Event = { kind: string; data: Record<string, unknown> };

function object(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error("Invalid saved classroom metadata.");
  return value;
}

function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("Invalid saved classroom text.");
  return value;
}

export class SavedClassrooms {
  constructor(readonly root: string) {}

  private events(id: ClassroomSessionId): Event[] {
    const directory = join(this.root, toClassroomSessionId(id));
    if (!lstatSync(directory).isDirectory()) throw new Error("Recording must be a local directory.");
    const path = join(directory, "events.jsonl");
    if (!lstatSync(path).isFile()) throw new Error("Recording log must be a local file.");
    return readFileSync(path, "utf8").split("\n").filter((line) => line.trim()).map((line) => {
      const entry = object(JSON.parse(line));
      return { kind: text(entry.kind), data: object(entry.data) };
    });
  }

  private lesson(id: ClassroomSessionId): RecordedLesson {
    const events = this.events(id);
    const prepared = events.find((event) => event.kind === "lesson-prepared");
    if (!prepared) throw new Error("课程脚本尚未保存完成。");
    const result = object(prepared.data.result);
    if (result.ok !== true) throw new Error("课程脚本未成功完成。");
    const lesson = parseLessonPlan(result.lesson);
    if (lesson.steps.length !== lesson.targetSceneCount) throw new Error("Saved lesson steps are incomplete.");
    const scenes = lesson.steps.map((step, index) => {
      const number = index + 1;
      const request = events.find((event) => event.kind === "video-request" && event.data.sceneNumber === number);
      const completed = events.find((event) => event.kind === "video-completed" && event.data.sceneNumber === number);
      if (!request || !completed) throw new Error(`第${number}段视频尚未生成完成。`);
      const plan = parsePlan(request.data.plan);
      const stem = `scene-${String(number).padStart(2, "0")}`;
      const metadataPath = join(this.root, id, `${stem}.json`);
      if (!lstatSync(metadataPath).isFile()) throw new Error("Recording metadata must be a local file.");
      const metadata = object(JSON.parse(readFileSync(metadataPath, "utf8")));
      if (metadata.sessionId !== id || metadata.sceneNumber !== number || metadata.teacherId !== lesson.teacherId || plan.teacherId !== lesson.teacherId || plan.sceneNumber !== number || plan.purpose.stepId !== step.id || plan.prompt !== metadata.prompt) {
        throw new Error("Saved video does not match its lesson and teacher.");
      }
      const mediaPath = this.mediaPath(id, number);
      if (lstatSync(mediaPath).size === 0) throw new Error("Saved video is empty.");
      const segment = parseSegment({
        kind: "generated", id: toSceneId(`saved-scene-${number}`), number,
        durationSeconds: CLASSROOM_CONFIG.clipDurationSeconds, purpose: plan.purpose,
        prompt: plan.prompt, summary: plan.summary, captions: plan.captions,
        videoUrl: `/api/saved-video/${encodeURIComponent(id)}/${number}`,
        providerUrl: metadata.sourceUrl, expandedPrompt: metadata.expandedPrompt, timings: metadata.timings,
      });
      if (segment.kind !== "generated") throw new Error("Saved video must be generated media.");
      if (segment.timings.requestId !== object(completed.data.timings).requestId || segment.providerUrl !== completed.data.providerUrl) {
        throw new Error("Saved video does not match the completed provider request.");
      }
      return { plan, segment };
    });
    return { lesson, scenes };
  }

  load(recordingId: ClassroomSessionId): RecordedClassroom {
    const selections = this.events(recordingId).filter((event) => event.kind === "lesson-selection").map((event) => event.data);
    if (selections.length < 1 || selections.length > 1 + DEMO_CONFIG.maxFollowups) throw new Error("Saved classroom path is invalid.");
    let previous: string | null = null;
    let teacher: TeacherId | null = null;
    const lessons = selections.map((selection, index) => {
      const id = toClassroomSessionId(text(selection.sessionId));
      if (selection.playlistId !== recordingId || selection.position !== index + 1 || selection.previousSessionId !== previous || (index === 0 && id !== recordingId)) {
        throw new Error("Saved classroom selections are out of order.");
      }
      const recorded = this.lesson(id);
      const expectedDuration = index === 0 ? DEMO_CONFIG.initialDurationSeconds : DEMO_CONFIG.followupDurationSeconds;
      if (recorded.lesson.topic !== selection.topic || recorded.lesson.teacherId !== selection.teacherId || recorded.lesson.durationSeconds !== expectedDuration || selection.durationSeconds !== expectedDuration || (teacher !== null && teacher !== recorded.lesson.teacherId)) {
        throw new Error("Saved classroom selection does not match its lesson.");
      }
      previous = id;
      teacher = recorded.lesson.teacherId;
      return recorded;
    });
    return { recordingId, lessons };
  }

  list(): SavedClassroomSummary[] {
    let directories;
    try { directories = readdirSync(this.root, { withFileTypes: true }); }
    catch (error) {
      if (isRecord(error) && error.code === "ENOENT") return [];
      throw error;
    }
    const summaries: SavedClassroomSummary[] = [];
    for (const directory of directories) {
      if (!directory.isDirectory()) continue;
      const id = toClassroomSessionId(directory.name);
      const selection = this.events(id).find((event) => event.kind === "lesson-selection" && event.data.position === 1);
      if (!selection) continue;
      let available = true;
      try { this.load(id); }
      catch { available = false; } // Known but incomplete recordings must never fall through to paid generation.
      summaries.push({ recordingId: id, teacherId: parseTeacherId(selection.data.teacherId), topic: text(selection.data.topic), available });
    }
    return summaries;
  }

  find(topic: string, teacherId: TeacherId): SavedClassroomSummary | null {
    const matches = this.list().filter((entry) => entry.teacherId === teacherId && recordingTopicKey(entry.topic) === recordingTopicKey(topic));
    return matches.find((entry) => entry.available) ?? matches[0] ?? null;
  }

  mediaPath(id: ClassroomSessionId, sceneNumber: number): string {
    const directory = join(this.root, toClassroomSessionId(id));
    if (!Number.isInteger(sceneNumber) || sceneNumber < 1 || sceneNumber > 6 || !lstatSync(directory).isDirectory()) throw new Error("Invalid recording video path.");
    const path = join(directory, `scene-${String(sceneNumber).padStart(2, "0")}.mp4`);
    if (!lstatSync(path).isFile()) throw new Error("Recording video must be a local file.");
    return path;
  }
}
