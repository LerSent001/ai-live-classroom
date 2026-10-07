import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { isRecord, parseLessonPlan, parsePlan, parseSegment, parseTeacherId, toClassroomSessionId, toSceneId } from "@/lib/classroom-boundaries";
import { CLASSROOM_CONFIG, DEMO_CONFIG } from "@/lib/classroom-config";
import { recordingTopicKey, type RecordedClassroom, type RecordedLesson, type SavedClassroomSummary } from "@/lib/saved-classroom";
import type { ClassroomSessionId, TeacherId } from "@/lib/classroom-types";
import { parseRecordingEvents } from "./recording-store";

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
  constructor(readonly root: string, private readonly mediaBase = "/api/saved-video", private readonly openingOnly = false) {}

  private events(id: ClassroomSessionId): Event[] {
    const directory = join(this.root, toClassroomSessionId(id));
    if (!lstatSync(directory).isDirectory()) throw new Error("Recording must be a local directory.");
    const path = join(directory, "events.jsonl");
    if (!lstatSync(path).isFile()) throw new Error("Recording log must be a local file.");
    return parseRecordingEvents(readFileSync(path, "utf8"));
  }

  loadLesson(id: ClassroomSessionId, visited = new Set<string>()): RecordedLesson {
    if (visited.has(id) || visited.size > 10) throw new Error("Saved recording reference is invalid.");
    visited.add(id);
    const events = this.events(id);
    const source = events.find(event => event.kind === "replay-source");
    if (source) {
      const recorded = this.loadLesson(toClassroomSessionId(text(source.data.recordingId)), visited);
      if (recorded.lesson.topic !== source.data.topic || recorded.lesson.teacherId !== source.data.teacherId) throw new Error("Saved replay identity does not match.");
      return recorded;
    }
    const prepared = events.find((event) => event.kind === "lesson-prepared");
    if (!prepared) throw new Error("课程脚本尚未保存完成。");
    const result = object(prepared.data.result);
    if (result.ok !== true) throw new Error("课程脚本未成功完成。");
    const lesson = parseLessonPlan(result.lesson);
    if (lesson.steps.length !== lesson.targetSceneCount) throw new Error("Saved lesson steps are incomplete.");
    const scenes = lesson.steps.map((step, index) => {
      const number = index + 1;
      const request = events.find((event) => event.kind === "video-request" && event.data.sceneNumber === number);
      const completed = events.findLast((event) => event.kind === "video-completed" && event.data.sceneNumber === number);
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
        videoUrl: `${this.mediaBase}/${encodeURIComponent(id)}/${number}`,
        providerUrl: metadata.sourceUrl, expandedPrompt: metadata.expandedPrompt, timings: metadata.timings,
      });
      if (segment.kind !== "generated") throw new Error("Saved video must be generated media.");
      if (segment.timings.requestId !== object(completed.data.timings).requestId || segment.providerUrl !== completed.data.providerUrl) {
        throw new Error("Saved video does not match the completed provider request.");
      }
      return { plan, segment };
    });
    return { recordingId: id, lesson, scenes };
  }

  load(recordingId: ClassroomSessionId): RecordedClassroom {
    const selections = this.events(recordingId).filter((event) => event.kind === "lesson-selection").map((event) => event.data);
    if (selections.length < 1 || selections.length > 1 + DEMO_CONFIG.maxFollowups) throw new Error("Saved classroom path is invalid.");
    let previous: string | null = null;
    let teacher: TeacherId | null = null;
    const lessons: RecordedLesson[] = [];
    for (const [index, selection] of selections.entries()) {
      const id = toClassroomSessionId(text(selection.sessionId));
      if (selection.playlistId !== recordingId || selection.position !== index + 1 || selection.previousSessionId !== previous || (index === 0 && id !== recordingId)) {
        throw new Error("Saved classroom selections are out of order.");
      }
      let recorded: RecordedLesson;
      try { recorded = this.loadLesson(id); }
      catch (error) { if (this.openingOnly && index > 0) break; throw error; }
      const expectedDuration = index === 0 ? DEMO_CONFIG.initialDurationSeconds : DEMO_CONFIG.followupDurationSeconds;
      const adaptive = this.openingOnly && index === 0 && this.events(id).some(event => (event.kind === "lesson-request" && event.data.adaptiveOpening === true) || event.kind === "replay-source");
      const durationMatches = recorded.lesson.durationSeconds === expectedDuration || (adaptive && [15, 20, 25].includes(recorded.lesson.durationSeconds));
      const selectionDurationMatches = selection.durationSeconds === expectedDuration || (adaptive && selection.durationSeconds === recorded.lesson.durationSeconds);
      if (recorded.lesson.topic !== selection.topic || recorded.lesson.teacherId !== selection.teacherId || !durationMatches || !selectionDurationMatches || (teacher !== null && teacher !== recorded.lesson.teacherId)) {
        throw new Error("Saved classroom selection does not match its lesson.");
      }
      previous = id;
      teacher = recorded.lesson.teacherId;
      lessons.push(recorded);
    }
    return { recordingId, lessons };
  }

  findLesson(topic: string, teacherId: TeacherId, durationSeconds: number): RecordedLesson | null {
    let directories;
    try { directories = readdirSync(this.root, { withFileTypes: true }); }
    catch (error) { if (isRecord(error) && error.code === "ENOENT") return null; throw error; }
    let incomplete = false;
    for (const directory of directories) {
      if (!directory.isDirectory()) continue;
      const id = toClassroomSessionId(directory.name);
      const events = this.events(id);
      const candidate = events.find(event => event.kind === "lesson-prepared");
      const prepared = candidate && isRecord(candidate.data.result) && isRecord(candidate.data.result.lesson) ? candidate.data.result.lesson : null;
      const link = events.find(event => event.kind === "playlist-link")?.data;
      const identity = prepared ?? link;
      if (identity?.teacherId !== teacherId || identity?.durationSeconds !== durationSeconds || typeof identity?.topic !== "string" || recordingTopicKey(identity.topic) !== recordingTopicKey(topic)) continue;
      if (!events.some(event => event.kind === "planner-request" || event.kind === "video-request")) continue;
      try { return this.loadLesson(id); } catch { incomplete = true; }
    }
    if (incomplete) throw new Error("这节课程已有未完成记录，正在回收原任务；请稍后重试。没有重新生成或扣费。");
    return null;
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
      if (this.openingOnly && !available && !this.events(id).some(event => event.kind === "planner-request" || event.kind === "video-request")) continue;
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
