import "server-only";

import { join } from "node:path";
import { RecordingStore } from "@/server/recording-store";
import { SavedClassrooms } from "@/server/saved-classrooms";

export function getSavedClassrooms(): SavedClassrooms {
  return new SavedClassrooms(join(process.cwd(), "recordings"));
}

export function createRecordingStore(): RecordingStore | null {
  const flag = process.env.SAVE_RECORDINGS?.trim().toLowerCase();
  return flag === "0" || flag === "false" || flag === "off"
    ? null
    : new RecordingStore(join(process.cwd(), "recordings"));
}
