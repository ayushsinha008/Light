export interface ImageBitmapLike {
  width: number;
  height: number;
  data?: Uint8ClampedArray | ArrayBuffer;
}

export interface UIDetection {
  label:
    | "button"
    | "link"
    | "input"
    | "text"
    | "dropdown"
    | "checkbox"
    | "radio"
    | "card"
    | "menu"
    | "tab"
    | "dialog"
    | "image"
    | "nav"
    | "table"
    | "form"
    | "pagination"
    | "control"
    | "unknown";
  bounds: { x: number; y: number; width: number; height: number };
  confidence: number;
  text?: string;
}

export interface OCRResult {
  text: string;
  blocks: Array<{
    text: string;
    bounds: { x: number; y: number; width: number; height: number };
    confidence: number;
  }>;
}

export interface VisionProvider {
  readonly name: string;
  readonly ready: boolean;
  init?(): Promise<void>;
  detectUI(image: ImageBitmapLike): Promise<UIDetection[]>;
}

export interface OCRProvider {
  readonly name: string;
  readonly ready: boolean;
  init?(): Promise<void>;
  recognize(image: ImageBitmapLike): Promise<OCRResult>;
}

/** Heuristic/DOM-backed vision: no cloud upload; used until ONNX models are loaded. */
export class HeuristicVisionProvider implements VisionProvider {
  readonly name = "heuristic";
  readonly ready = true;

  async detectUI(_image: ImageBitmapLike): Promise<UIDetection[]> {
    // Screenshots stay local. Without a loaded ONNX model we return empty
    // and rely on DOM/accessibility perception in the extension.
    return [];
  }
}

/** Placeholder OCR — swap for Tesseract.js / ONNX OCR in production. */
export class StubOCRProvider implements OCRProvider {
  readonly name = "stub-ocr";
  readonly ready = true;

  async recognize(_image: ImageBitmapLike): Promise<OCRResult> {
    return { text: "", blocks: [] };
  }
}

/**
 * ONNX Runtime Web + WebGPU provider skeleton.
 * Models are loaded from extension packaged assets when present.
 * Never uploads frames to the cloud.
 */
export class OnnxWebGPUVisionProvider implements VisionProvider {
  readonly name = "onnx-webgpu";
  ready = false;
  private modelUrl?: string;

  constructor(modelUrl?: string) {
    this.modelUrl = modelUrl;
  }

  async init(): Promise<void> {
    if (!this.modelUrl) {
      this.ready = false;
      return;
    }
    // Model loading is deferred to the extension runtime where ORT Web is bundled.
    // This package exposes the interface; the extension wires the concrete session.
    this.ready = false;
  }

  async detectUI(_image: ImageBitmapLike): Promise<UIDetection[]> {
    if (!this.ready) return [];
    return [];
  }
}

export function createDefaultVisionProvider(): VisionProvider {
  return new HeuristicVisionProvider();
}

export function createDefaultOCRProvider(): OCRProvider {
  return new StubOCRProvider();
}
