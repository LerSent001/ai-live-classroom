import { join } from "node:path";
import JSZip from "jszip";
import PptxGenJS from "pptxgenjs";
import PDFDocument from "pdfkit";
import type { CourseDocument, CoursePage, CourseSection } from "@/lib/classroom-types";

const PDF_FONT_PATH = join(
  process.cwd(),
  "node_modules/@fontsource/noto-sans-sc/files/noto-sans-sc-chinese-simplified-400-normal.woff",
);
const COLORS = {
  ink: "120E15",
  paper: "FFFAFD",
  pink: "FF167D",
  muted: "CBC4CD",
  line: "4A3C49",
} as const;

export type ResolvedCourseMedia = ReadonlyMap<string, string>;

async function removeDanglingMasterContentTypes(bytes: Buffer): Promise<Buffer> {
  const archive = await JSZip.loadAsync(bytes);
  const path = "[Content_Types].xml";
  const entry = archive.file(path);
  if (!entry) throw new Error("PPTX is missing [Content_Types].xml");
  const source = await entry.async("string");
  const cleaned = source.replace(
    /<Override PartName="\/(ppt\/slideMasters\/slideMaster\d+\.xml)" ContentType="application\/vnd\.openxmlformats-officedocument\.presentationml\.slideMaster\+xml"\/>/g,
    (declaration, target: string) => archive.file(target) ? declaration : "",
  );
  if (cleaned === source) return bytes;
  archive.file(path, cleaned);
  const normalized = await archive.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  return Buffer.from(normalized);
}

function sections(document: CourseDocument): readonly CourseSection[] {
  return document.main ? [document.main, ...document.appendices] : document.appendices;
}

function pageLabel(section: CourseSection, index: number): string {
  return section.kind === "main" ? `MAIN ${String(index + 1).padStart(2, "0")}` : `APPENDIX ${index + 1}`;
}

function safeText(value: string, limit = 800): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ").slice(0, limit);
}

export async function buildCoursePptx(
  document: CourseDocument,
  media: ResolvedCourseMedia,
): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "AI Live Classroom";
  pptx.company = "LerSent001";
  pptx.subject = safeText(document.subject, 240);
  pptx.title = safeText(document.title, 240);
  pptx.theme = {
    headFontFace: "Noto Sans SC",
    bodyFontFace: "Noto Sans SC",
  };

  const cover = pptx.addSlide();
  cover.background = { color: COLORS.ink };
  cover.addShape(pptx.ShapeType.rect, { x: 0.65, y: 0.72, w: 0.13, h: 5.85, line: { color: COLORS.pink }, fill: { color: COLORS.pink } });
  cover.addText("AI LIVE CLASSROOM", { x: 1.05, y: 0.82, w: 5.8, h: 0.35, fontFace: "Arial", fontSize: 13, bold: true, color: COLORS.pink, charSpacing: 2.2, margin: 0 });
  cover.addText(safeText(document.title, 180), { x: 1.02, y: 1.48, w: 10.9, h: 2.15, fontFace: "Noto Sans SC", fontSize: 34, bold: true, color: COLORS.paper, breakLine: false, margin: 0.03, valign: "middle", fit: "shrink" });
  cover.addText(safeText(document.subject, 260), { x: 1.05, y: 4.15, w: 9.8, h: 0.85, fontFace: "Noto Sans SC", fontSize: 18, color: COLORS.muted, margin: 0, fit: "shrink" });
  const allSections = sections(document);
  const pageCount = allSections.reduce((sum, section) => sum + section.pages.length, 0);
  const totalSeconds = allSections.reduce((sum, section) => sum + section.durationSeconds, 0);
  cover.addText(`${pageCount} 页课件  /  ${totalSeconds} 秒生成视频  /  ${document.appendices.length} 个问题附录`, { x: 1.05, y: 5.55, w: 8.5, h: 0.35, fontFace: "Noto Sans SC", fontSize: 12, color: COLORS.paper, margin: 0 });
  cover.addNotes(`课程主题：${safeText(document.subject)}\n导出内容复用课堂中已经生成的视频，没有新增模型请求。`);

  for (const section of allSections) {
    for (const [index, page] of section.pages.entries()) {
      const slide = pptx.addSlide();
      slide.background = { color: COLORS.ink };
      slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 0.16, line: { color: COLORS.pink }, fill: { color: COLORS.pink } });
      slide.addText(pageLabel(section, index), { x: 0.62, y: 0.42, w: 2.8, h: 0.3, fontFace: "Arial", fontSize: 10, bold: true, color: COLORS.pink, charSpacing: 1.6, margin: 0 });
      slide.addText(safeText(page.title, 180), { x: 0.62, y: 0.92, w: 12.05, h: 0.82, fontFace: "Noto Sans SC", fontSize: 26, bold: true, color: COLORS.paper, margin: 0, fit: "shrink" });

      const mediaPath = media.get(page.id);
      if (mediaPath) {
        slide.addMedia({
          type: "video",
          path: mediaPath,
          x: 0.62,
          y: 2.0,
          w: 7.45,
          h: 4.19,
          extn: "mp4",
        });
      } else {
        slide.addShape(pptx.ShapeType.rect, { x: 0.62, y: 2.0, w: 7.45, h: 4.19, line: { color: COLORS.line, width: 1.2 }, fill: { color: "201923" } });
        slide.addText("本页视频未生成\n保留文字课件", { x: 2.0, y: 3.35, w: 4.7, h: 1.1, fontFace: "Noto Sans SC", fontSize: 21, bold: true, color: COLORS.muted, align: "center", valign: "middle", margin: 0.05 });
      }

      slide.addText("知识点", { x: 8.48, y: 2.02, w: 1.1, h: 0.28, fontFace: "Noto Sans SC", fontSize: 10, bold: true, color: COLORS.pink, margin: 0 });
      slide.addText(safeText(page.concept, 420), { x: 8.48, y: 2.38, w: 4.18, h: 1.45, fontFace: "Noto Sans SC", fontSize: 17, bold: true, color: COLORS.paper, margin: 0, breakLine: false, fit: "shrink", valign: "top" });
      slide.addShape(pptx.ShapeType.line, { x: 8.48, y: 4.05, w: 4.05, h: 0, line: { color: COLORS.line, width: 1 } });
      slide.addText("学习目标", { x: 8.48, y: 4.3, w: 1.2, h: 0.28, fontFace: "Noto Sans SC", fontSize: 10, bold: true, color: COLORS.pink, margin: 0 });
      slide.addText(safeText(page.teachingGoal, 420), { x: 8.48, y: 4.65, w: 4.18, h: 1.15, fontFace: "Noto Sans SC", fontSize: 14, color: COLORS.muted, margin: 0, fit: "shrink", valign: "top" });
      slide.addText(`${page.startSeconds}s - ${page.endSeconds}s`, { x: 11.25, y: 6.78, w: 1.4, h: 0.25, fontFace: "Arial", fontSize: 9, color: COLORS.muted, align: "right", margin: 0 });
      slide.addNotes(`讲解词：${safeText(page.narration)}\n\n画面设计：${safeText(page.visualAction)}\n\n页面小结：${safeText(page.summary)}`);
    }
  }

  const output = await pptx.write({ outputType: "nodebuffer", compression: true });
  const bytes = Buffer.isBuffer(output) ? output : Buffer.from(output as Uint8Array);
  return removeDanglingMasterContentTypes(bytes);
}

function collectPdf(document: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    document.on("data", (chunk: Buffer | Uint8Array) => chunks.push(Buffer.from(chunk)));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });
}

function addPdfBackground(pdf: PDFKit.PDFDocument): void {
  pdf.rect(0, 0, 960, 540).fill(`#${COLORS.ink}`);
  pdf.rect(0, 0, 960, 9).fill(`#${COLORS.pink}`);
}

function addPdfPage(
  pdf: PDFKit.PDFDocument,
  section: CourseSection,
  page: CoursePage,
  index: number,
  videoLink: string | null,
): void {
  pdf.addPage();
  addPdfBackground(pdf);
  pdf.fillColor(`#${COLORS.pink}`).fontSize(11).text(pageLabel(section, index), 48, 34, { width: 260, characterSpacing: 1.4 });
  pdf.fillColor(`#${COLORS.paper}`).fontSize(28).text(safeText(page.title, 180), 48, 77, { width: 850, height: 70, ellipsis: true });
  pdf.roundedRect(48, 167, 520, 286, 8).fill("#201923");
  pdf.fillColor(`#${COLORS.pink}`).fontSize(11).text("课程视频", 78, 198, { width: 160 });
  pdf.fillColor(`#${COLORS.paper}`).fontSize(22).text(
    page.media.status === "ready" ? `第 ${page.position} 段视频已生成` : "本页保留文字课件",
    78,
    245,
    { width: 400, align: "center" },
  );
  pdf.fillColor(`#${COLORS.muted}`).fontSize(13).text(`${page.startSeconds}s - ${page.endSeconds}s`, 78, 312, { width: 400, align: "center" });
  if (videoLink) {
    pdf.fillColor(`#${COLORS.pink}`).fontSize(13).text("打开原课程视频", 78, 365, { width: 400, align: "center", link: videoLink, underline: true });
  }
  pdf.fillColor(`#${COLORS.pink}`).fontSize(11).text("知识点", 610, 174, { width: 250 });
  pdf.fillColor(`#${COLORS.paper}`).fontSize(18).text(safeText(page.concept, 420), 610, 207, { width: 300, height: 102, ellipsis: true });
  pdf.moveTo(610, 326).lineTo(910, 326).lineWidth(1).strokeColor(`#${COLORS.line}`).stroke();
  pdf.fillColor(`#${COLORS.pink}`).fontSize(11).text("学习目标", 610, 350, { width: 250 });
  pdf.fillColor(`#${COLORS.muted}`).fontSize(14).text(safeText(page.teachingGoal, 420), 610, 382, { width: 300, height: 72, ellipsis: true });
  pdf.fillColor(`#${COLORS.muted}`).fontSize(9).text(safeText(page.summary, 240), 48, 492, { width: 760, height: 22, ellipsis: true });
  pdf.fillColor(`#${COLORS.muted}`).fontSize(9).text(`${section.kind === "main" ? "MAIN" : "APPENDIX"}  /  ${page.position}`, 825, 492, { width: 85, align: "right" });
}

export async function buildCoursePdf(
  document: CourseDocument,
  publicVideoUrl: (section: CourseSection, page: CoursePage) => string | null,
): Promise<Buffer> {
  const pdf = new PDFDocument({
    autoFirstPage: false,
    size: [960, 540],
    margin: 0,
    bufferPages: true,
    info: {
      Title: safeText(document.title, 240),
      Author: "AI Live Classroom",
      Subject: safeText(document.subject, 240),
    },
  });
  pdf.registerFont("NotoSansSC", PDF_FONT_PATH);
  pdf.font("NotoSansSC");
  const output = collectPdf(pdf);

  pdf.addPage();
  addPdfBackground(pdf);
  pdf.rect(48, 52, 8, 395).fill(`#${COLORS.pink}`);
  pdf.fillColor(`#${COLORS.pink}`).fontSize(11).text("AI LIVE CLASSROOM", 85, 64, { width: 360, characterSpacing: 2 });
  pdf.fillColor(`#${COLORS.paper}`).fontSize(36).text(safeText(document.title, 180), 85, 135, { width: 780, height: 160, ellipsis: true });
  pdf.fillColor(`#${COLORS.muted}`).fontSize(18).text(safeText(document.subject, 260), 85, 333, { width: 720, height: 62, ellipsis: true });
  const allSections = sections(document);
  const pageCount = allSections.reduce((sum, section) => sum + section.pages.length, 0);
  const totalSeconds = allSections.reduce((sum, section) => sum + section.durationSeconds, 0);
  pdf.fillColor(`#${COLORS.paper}`).fontSize(11).text(`${pageCount} 页课件  /  ${totalSeconds} 秒生成视频  /  ${document.appendices.length} 个问题附录`, 85, 454, { width: 620 });

  for (const section of allSections) {
    for (const [index, page] of section.pages.entries()) {
      addPdfPage(pdf, section, page, index, publicVideoUrl(section, page));
    }
  }
  pdf.end();
  return output;
}
