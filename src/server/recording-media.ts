import { createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";

// Video elements request byte ranges when preloading and seeking between clips.
export function recordedVideoResponse(path: string, range: string | null, head = false): Response {
  const size = statSync(path).size;
  const headers = new Headers({ "content-type": "video/mp4", "accept-ranges": "bytes", "cache-control": "private, max-age=3600" });
  let start = 0;
  let end = size - 1;
  if (range !== null) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) {
      headers.set("content-range", `bytes */${size}`);
      return new Response(null, { status: 416, headers });
    }
    if (match[1]) {
      start = Number(match[1]);
      end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    } else {
      const suffix = Number(match[2]);
      start = Math.max(0, size - suffix);
    }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= size) {
      headers.set("content-range", `bytes */${size}`);
      return new Response(null, { status: 416, headers });
    }
    headers.set("content-range", `bytes ${start}-${end}/${size}`);
  }
  headers.set("content-length", String(end - start + 1));
  const body = head ? null : Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream<Uint8Array>;
  return new Response(body, { status: range === null ? 200 : 206, headers });
}
