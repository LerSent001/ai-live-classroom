import "server-only";
import { join } from "node:path";
import { wallets } from "@/server/youth-tokenpay-wallet";
import { YouthRuntimeRegistry } from "@/server/youth-classroom-runtime";
import { RecordingStore } from "@/server/recording-store";
import { SavedClassrooms } from "@/server/saved-classrooms";

function recordingRoot(owner: string): string {
  if (!/^[a-f0-9]{64}$/.test(owner)) throw new Error("Invalid wallet owner.");
  return join(process.cwd(), ".youth-recordings", owner);
}
export function getYouthSavedClassrooms(owner: string) {
  return new SavedClassrooms(recordingRoot(owner), "/api/youth/saved-video", true);
}
const globalYouth = globalThis as typeof globalThis & { youthRuntimeRegistryV2?: YouthRuntimeRegistry };
const registry = globalYouth.youthRuntimeRegistryV2 ??= new YouthRuntimeRegistry(wallets, (owner) =>
  ["0", "false", "off"].includes(process.env.SAVE_RECORDINGS?.trim().toLowerCase() ?? "")
    ? null : new RecordingStore(recordingRoot(owner), "zh-youth-tokenpay-v1"));
export function getYouthRuntime(owner: string) { return registry.get(owner); }
export function repairYouthRecording(owner: string, recordingId: string) {
  return registry.repair(owner, recordingId);
}
export function youthRecoveryAction(owner: string, recordingId: string) { return registry.recoveryAction(owner, recordingId); }
