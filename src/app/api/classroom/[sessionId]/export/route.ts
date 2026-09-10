import { isRecord, toClassroomSessionId } from "@/lib/classroom-boundaries";
import type { CourseDocument, CoursePage, CourseSection } from "@/lib/classroom-types";
import { getSavedClassrooms } from "@/server/archive";
import { buildCoursePdf, buildCoursePptx } from "@/server/course-export";
import { getClassroomRuntime } from "@/server/classroom-runtime-instance";
import { ownerFrom } from "@/server/tokenpay-wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = Readonly<{ params: Promise<{ sessionId: string }> }>;

function responseHeaders(format: "pptx" | "pdf", title: string): Headers {
  const safeStem = title
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "ai-live-classroom-course";
  return new Headers({
    "cache-control": "private, no-store",
    "content-disposition": `attachment; filename="${safeStem}.${format}"`,
    "content-type": format === "pptx"
      ? "application/vnd.openxmlformats-officedocument.presentationml.presentation"
      : "application/pdf",
    "x-content-type-options": "nosniff",
  });
}

function allSections(document: CourseDocument): readonly CourseSection[] {
  return document.main ? [document.main, ...document.appendices] : document.appendices;
}

function recordedMediaIdentity(section: CourseSection, page: CoursePage): {
  sessionId: string;
  sceneNumber: number;
} {
  const saved = page.media.videoUrl?.match(/^\/api\/saved-video\/([^/]+)\/(\d+)$/);
  if (saved) {
    return {
      sessionId: decodeURIComponent(saved[1]!),
      sceneNumber: Number(saved[2]),
    };
  }
  return { sessionId: section.sessionId, sceneNumber: page.position };
}

function mediaPaths(owner: string, document: CourseDocument): ReadonlyMap<string, string> {
  const saved = getSavedClassrooms(owner);
  const paths = new Map<string, string>();
  for (const section of allSections(document)) {
    for (const page of section.pages) {
      if (page.media.status !== "ready") continue;
      const identity = recordedMediaIdentity(section, page);
      paths.set(
        page.id,
        saved.mediaPath(toClassroomSessionId(identity.sessionId), identity.sceneNumber),
      );
    }
  }
  return paths;
}

function absoluteVideoUrl(request: Request, page: CoursePage): string | null {
  if (page.media.status !== "ready" || !page.media.videoUrl) return null;
  try {
    return new URL(page.media.videoUrl, request.url).toString();
  } catch {
    return null;
  }
}

export async function GET(request: Request, context: Context): Promise<Response> {
  const owner = ownerFrom(request);
  if (!owner) return Response.json({ error: "请刷新课堂。" }, { status: 404 });
  try {
    const params = await context.params;
    const sessionId = toClassroomSessionId(params.sessionId);
    const snapshot = getClassroomRuntime(owner).view(sessionId);
    if (!snapshot) return Response.json({ error: "课堂不存在。" }, { status: 404 });
    const format = new URL(request.url).searchParams.get("format");
    if (format !== "pptx" && format !== "pdf") {
      return Response.json({ error: "请选择 pptx 或 pdf。" }, { status: 400 });
    }
    if (!snapshot.courseDocument.exportReady) {
      return Response.json(
        { error: "课件视频仍在生成，请完成后再下载。" },
        { status: 409, headers: { "cache-control": "no-store" } },
      );
    }
    const bytes = format === "pptx"
      ? await buildCoursePptx(snapshot.courseDocument, mediaPaths(owner, snapshot.courseDocument))
      : await buildCoursePdf(
          snapshot.courseDocument,
          (_section, page) => absoluteVideoUrl(request, page),
        );
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: responseHeaders(format, snapshot.courseDocument.title),
    });
  } catch (error) {
    const missing = isRecord(error) && error.code === "ENOENT";
    if (!missing) console.error("[course-export]", error);
    return Response.json(
      {
        error: missing
          ? "视频正在保存到课件，请稍后再下载。"
          : "课件导出失败，请稍后重试。",
      },
      { status: missing ? 409 : 500, headers: { "cache-control": "no-store" } },
    );
  }
}
