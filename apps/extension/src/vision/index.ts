/** Local vision bootstrap for the extension content world. */
import { createDefaultOCRProvider, createDefaultVisionProvider } from "@privai/vision";

export const visionProvider = createDefaultVisionProvider();
export const ocrProvider = createDefaultOCRProvider();

export async function initLocalVision(): Promise<{ visionReady: boolean; ocrReady: boolean }> {
  await visionProvider.init?.();
  await ocrProvider.init?.();
  return { visionReady: visionProvider.ready, ocrReady: ocrProvider.ready };
}
