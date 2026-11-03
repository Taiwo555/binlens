import { useMemo, useState } from "react";
import type { Slice } from "../lib/macho/types.ts";
import { formatBytes } from "../lib/macho/reader.ts";
import { CopyButton } from "./ui.tsx";

export interface HexJump {
  offset: number;
  length: number;
  label: string;
  nonce: number;
}

const PAGE = 1024;
const COLS = 16;

function toHex(value: number, width: number) {
  return value.toString(16).toUpperCase().padStart(width, "0");
}

export function HexTab({
  buffer,
  slice,
  jump,
  onJump,
}: {
  buffer: ArrayBuffer;
  slice: Slice;
  jump: HexJump | null;
  onJump: (offset: number, length: number, label: string) => void;
}) {
  const sliceEnd = slice.offset + slice.size;
  const pages = Math.max(1, Math.ceil(slice.size / PAGE));
  const pageFor = (offset: number) =>
    Math.max(0, Math.min(pages - 1, Math.floor((offset - slice.offset) / PAGE)));

  const [page, setPage] = useState(() => (jump ? pageFor(jump.offset) : 0));
  const [input, setInput] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const headerSize = slice.is64 ? 32 : 28;

  // A jump from another tab arrives as a new object with a bumped nonce. React
  // allows adjusting state during render; an effect would render the old page
  // first and flash the wrong bytes.
  const [seenNonce, setSeenNonce] = useState(jump?.nonce ?? -1);
  if (jump && jump.nonce !== seenNonce) {
    setSeenNonce(jump.nonce);
    setPage(pageFor(jump.offset));
  }

  const pageStart = slice.offset + page * PAGE;
  const pageEnd = Math.min(sliceEnd, pageStart + PAGE);

  const rows = useMemo(() => {
    const out: number[] = [];
    for (let offset = pageStart; offset < pageEnd; offset += COLS) out.push(offset);
    return out;
  }, [pageStart, pageEnd]);

  function goToOffset(raw: string) {
    const text = raw.trim();
    if (!text) return;
    const value = /^0x/i.test(text) ? Number.parseInt(text.slice(2), 16) : Number(text);
    if (!Number.isFinite(value)) {
      setNote("Enter a decimal offset or one prefixed with 0x.");
      return;
    }
    const clamped = Math.max(slice.offset, Math.min(sliceEnd - 1, Math.trunc(value)));
    setPage(Math.floor((clamped - slice.offset) / PAGE));
    setNote(clamped !== Math.trunc(value) ? "Clamped to the bounds of this slice." : null);
    setInput("");
  }

  const inJump = (offset: number) =>
    jump !== null && offset >= jump.offset && offset < jump.offset + jump.length;

  return (
    <div className="stack fill hex">
      <div className="toolbar toolbar-wrap">
        <div className="pager">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setPage((value) => Math.max(0, value - 1))}
            disabled={page === 0}
            aria-label="Previous page"
          >
            ←
          </button>
          <span className="pager-label mono">
            page {page + 1} / {pages}
          </span>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setPage((value) => Math.min(pages - 1, value + 1))}
            disabled={page >= pages - 1}
            aria-label="Next page"
          >
            →
          </button>
        </div>

        <input
          className="search mono"
          placeholder="Go to offset — 0x1000 or 4096"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") goToOffset(input);
          }}
          aria-label="Go to file offset"
        />

        <select
          className="select"
          value=""
          onChange={(event) => {
            const section = slice.sections.find((item) => String(item.index) === event.target.value);
            if (section && section.size > 0) {
              onJump(slice.offset + section.offset, section.size, `${section.segname},${section.name}`);
            }
          }}
          aria-label="Jump to a section"
        >
          <option value="">Jump to section…</option>
          {slice.sections
            .filter((section) => section.size > 0)
            .map((section) => (
              <option key={section.index} value={section.index}>
                {section.segname},{section.name} · {formatBytes(section.size)}
              </option>
            ))}
        </select>
      </div>

      <div className="quick-jumps">
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          onClick={() => onJump(slice.offset, headerSize, "Mach header")}
        >
          Mach header
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          onClick={() => onJump(slice.offset + headerSize, slice.sizeofcmds, "load commands")}
        >
          Load commands
        </button>
        {slice.codeSignature && (
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={() =>
              onJump(
                slice.codeSignature!.fileOffset,
                slice.codeSignature!.size,
                "code signature",
              )
            }
          >
            Code signature
          </button>
        )}
        <span className="quick-meta mono">
          {toHex(pageStart, 6)} – {toHex(Math.max(pageStart, pageEnd - 1), 6)} ·{" "}
          {formatBytes(pageEnd - pageStart)}
        </span>
      </div>

      {jump && (
        <p className="jump-note">
          <span className="mono">{jump.label}</span> at 0x{toHex(jump.offset, 6)}, {formatBytes(jump.length)}
          <CopyButton value={`0x${toHex(jump.offset, 6)}`} label="Copy offset" />
        </p>
      )}

      {note && <p className="jump-note warn-text">{note}</p>}

      <div className="hex-code">
        <div className="hex-row hex-ruler" aria-hidden="true">
          <span className="hex-off">offset</span>
          {Array.from({ length: COLS }, (_, index) => (
            <span key={index} className="hex-byte">
              {toHex(index, 2)}
            </span>
          ))}
          <span className="hex-ascii">ASCII</span>
        </div>

        {rows.map((rowOffset) => {
          const length = Math.min(COLS, pageEnd - rowOffset);
          const bytes = new Uint8Array(buffer, rowOffset, length);
          let ascii = "";
          for (const byte of bytes) ascii += byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : ".";

          return (
            <div className="hex-row" key={rowOffset}>
              <span className="hex-off">{toHex(rowOffset, 6)}</span>
              {Array.from({ length: COLS }, (_, index) => (
                <span
                  className={`hex-byte${index < length ? "" : " empty"}${inJump(rowOffset + index) ? " hot" : ""}`}
                  key={index}
                >
                  {index < length ? toHex(bytes[index], 2) : "  "}
                </span>
              ))}
              <span className="hex-ascii">{ascii}</span>
            </div>
          );
        })}
      </div>

      <p className="pane-foot">
        Raw bytes of slice {slice.index} at file offset{" "}
        <span className="mono">0x{toHex(slice.offset, 6)}</span>. Addresses shown are offsets into
        the file, not virtual addresses.
      </p>
    </div>
  );
}
