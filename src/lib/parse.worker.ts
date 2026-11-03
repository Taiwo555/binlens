import { parseBinary } from "./macho/parse.ts";

self.onmessage = (event: MessageEvent<{ buffer: ArrayBuffer; fileName: string }>) => {
  const { buffer, fileName } = event.data;
  const parsed = parseBinary(buffer, fileName);
  self.postMessage({ parsed });
};
