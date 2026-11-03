import type { Section, StringHit } from "./types.ts";

const MIN_STRING = 4;
const MAX_HITS = 20000;

/** Sections whose contents are, by definition, text rather than machine code. */
const TEXT_SECTIONS = new Set([
  "__cstring",
  "__objc_methname",
  "__objc_classname",
  "__objc_methtype",
  "__const",
  "__oslogstring",
  "__loginame",
]);

function isPrintable(b: number): boolean {
  return b >= 0x20 && b <= 0x7e;
}

/**
 * Pulls printable ASCII runs out of a byte range. This is the same idea as
 * `strings(1)`: a run of printable bytes terminated by anything else.
 */
export function scanAscii(bytes: Uint8Array, fileBase: number, min: number = MIN_STRING): StringHit[] {
  const hits: StringHit[] = [];
  let start = -1;

  for (let i = 0; i <= bytes.length; i++) {
    const byte = i < bytes.length ? bytes[i] : 0;
    if (i < bytes.length && isPrintable(byte)) {
      if (start === -1) start = i;
      continue;
    }
    if (start !== -1) {
      const length = i - start;
      if (length >= min) {
        hits.push({
          value: new TextDecoder().decode(bytes.subarray(start, i)),
          section: "",
          segname: "",
          fileOffset: fileBase + start,
        });
      }
      start = -1;
    }
  }
  return hits;
}

/** UTF-16LE runs, used by __ustring and some Swift metadata sections. */
function scanUtf16(bytes: Uint8Array, fileBase: number, min: number = MIN_STRING): StringHit[] {
  const hits: StringHit[] = [];
  let start = -1;

  const codeUnit = (i: number) => {
    if (i + 1 >= bytes.length) return 0;
    return bytes[i] | (bytes[i + 1] << 8);
  };

  const push = (from: number, to: number) => {
    const length = (to - from) / 2;
    if (length < min) return;
    let text = "";
    for (let j = from; j < to; j += 2) text += String.fromCharCode(codeUnit(j));
    hits.push({ value: text, section: "", segname: "", fileOffset: fileBase + from });
  };

  let i = 0;
  for (; i + 1 < bytes.length; i += 2) {
    const unit = codeUnit(i);
    const printable = unit >= 0x20 && unit <= 0x7e;
    if (printable) {
      if (start === -1) start = i;
      continue;
    }
    if (start !== -1) {
      push(start, i);
      start = -1;
    }
  }

  // A string that runs to the final byte has no terminator to flush it.
  if (start !== -1) push(start, i);

  return hits;
}

/**
 * Extracts strings from the sections that hold text. Code sections are skipped
 * because random instruction bytes produce noise that hides real strings.
 */
export function extractStrings(
  buffer: ArrayBuffer,
  sections: Section[],
  sliceBase: number,
  sliceSize: number,
): StringHit[] {
  const out: StringHit[] = [];
  const limit = sliceBase + sliceSize;

  for (const section of sections) {
    if (out.length >= MAX_HITS) break;
    if (section.size === 0 || section.offset === 0) continue;

    const abs = sliceBase + section.offset;
    if (abs < sliceBase || abs + section.size > limit) continue;
    if (abs + section.size > buffer.byteLength) continue;

    const isUtf16 = section.name === "__ustring";
    const worthScanning = isUtf16 || TEXT_SECTIONS.has(section.name) || section.name.startsWith("__objc_");
    if (!worthScanning) continue;

    const bytes = new Uint8Array(buffer, abs, section.size);
    const hits = isUtf16 ? scanUtf16(bytes, abs) : scanAscii(bytes, abs);

    for (const hit of hits) {
      if (out.length >= MAX_HITS) break;
      out.push({ ...hit, section: section.name, segname: section.segname });
    }
  }

  return out;
}

/** Fallback scan over a whole slice, used when a binary has no text sections. */
export function extractStringsFromRange(
  buffer: ArrayBuffer,
  start: number,
  size: number,
  cap: number,
): StringHit[] {
  const end = Math.min(buffer.byteLength, start + size, start + 16 * 1024 * 1024);
  if (end <= start) return [];
  const bytes = new Uint8Array(buffer, start, end - start);
  return scanAscii(bytes, start).slice(0, cap);
}
