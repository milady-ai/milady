import { Updater } from "electrobun/bun";
import type { Result } from "../../shared/domain";
import type { UpdateCheckOutput } from "../../shared/rpc";

export async function getLocalUpdateInfo() {
  return Updater.getLocalInfo?.();
}

export async function checkForUpdates(): Promise<Result<UpdateCheckOutput>> {
  try {
    const info = await Updater.checkForUpdate();
    return {
      ok: true,
      value: {
        updateAvailable: Boolean(info.updateAvailable),
        updateReady: Boolean(info.updateReady),
        version: info.version,
        error: info.error,
      },
    };
  } catch (error) {
    return { ok: false, error: { code: "tool-failed", message: error instanceof Error ? error.message : "Update check failed.", recoverable: true } };
  }
}

export async function downloadUpdate(): Promise<Result<{ downloaded: boolean }>> {
  const info = await Updater.checkForUpdate();
  if (!info.updateAvailable) return { ok: true, value: { downloaded: false } };
  await Updater.downloadUpdate();
  return { ok: true, value: { downloaded: true } };
}

export async function applyUpdateAfterUserConfirms(hasUnsavedWork: () => boolean): Promise<Result<{ applying: boolean }>> {
  if (hasUnsavedWork()) {
    return { ok: false, error: { code: "confirmation-required", message: "Save your work before applying the update.", recoverable: true } };
  }
  const info = Updater.updateInfo?.();
  if (!info?.updateReady) return { ok: true, value: { applying: false } };
  await Updater.applyUpdate();
  return { ok: true, value: { applying: true } };
}
