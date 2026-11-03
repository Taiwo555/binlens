import { parseBinary } from "./macho/parse.ts";
import type { ParsedBinary } from "./macho/types.ts";

export interface ParseOutcome {
  parsed: ParsedBinary;
  durationMs: number;
}

/**
 * Parses off the main thread so a large binary never freezes the interface.
 * Falls back to inline parsing if the browser refuses to start a worker.
 */
export async function parseFile(buffer: ArrayBuffer, fileName: string): Promise<ParseOutcome> {
  const started = performance.now();

  try {
    const worker = new Worker(new URL("./parse.worker.ts", import.meta.url), { type: "module" });

    const parsed = await new Promise<ParsedBinary>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<{ parsed: ParsedBinary }>) => {
        resolve(event.data.parsed);
        worker.terminate();
      };
      worker.onerror = (event) => {
        reject(new Error(event.message || "worker failed"));
        worker.terminate();
      };
      worker.postMessage({ buffer, fileName });
    });

    return { parsed, durationMs: performance.now() - started };
  } catch {
    const parsed = parseBinary(buffer, fileName);
    return { parsed, durationMs: performance.now() - started };
  }
}
