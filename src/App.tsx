import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ParsedBinary } from "./lib/macho/types.ts";
import { toArrayBuffer } from "./lib/macho/build.ts";
import { formatBytes } from "./lib/macho/reader.ts";
import { parseFile } from "./lib/parse-client.ts";
import { sampleBinary } from "./lib/sample.ts";
import { CommandsTab } from "./components/CommandsTab.tsx";
import { DropZone } from "./components/DropZone.tsx";
import { HexTab, type HexJump } from "./components/HexTab.tsx";
import { LibrariesTab } from "./components/LibrariesTab.tsx";
import { OverviewTab } from "./components/OverviewTab.tsx";
import { SegmentsTab } from "./components/SegmentsTab.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { SignatureTab } from "./components/SignatureTab.tsx";
import { StringsTab } from "./components/StringsTab.tsx";
import { TabBar, type TabDef } from "./components/TabBar.tsx";

type TabId = "overview" | "segments" | "commands" | "libraries" | "signature" | "strings" | "hex";

export default function App() {
  const [parsed, setParsed] = useState<ParsedBinary | null>(null);
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [arch, setArch] = useState(0);
  const [tab, setTab] = useState<TabId>("overview");
  const [jump, setJump] = useState<HexJump | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (bytes: ArrayBuffer, fileName: string) => {
    setBusy(fileName);
    setError(null);
    try {
      const result = await parseFile(bytes, fileName);
      setParsed(result.parsed);
      setBuffer(bytes);
      setDurationMs(result.durationMs);
      setArch(0);
      setTab("overview");
      setJump(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The file could not be read.");
    } finally {
      setBusy(null);
    }
  }, []);

  const loadFile = useCallback(
    async (file: File) => {
      try {
        const bytes = await file.arrayBuffer();
        await load(bytes, file.name);
      } catch {
        setError(`Could not read ${file.name}.`);
      }
    },
    [load],
  );

  const openPicker = useCallback(() => inputRef.current?.click(), []);

  const openSample = useCallback(() => {
    const { bytes, fileName } = sampleBinary();
    void load(toArrayBuffer(bytes), fileName);
  }, [load]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "o") {
        event.preventDefault();
        inputRef.current?.click();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    let depth = 0;
    const hasFiles = (event: DragEvent) =>
      Array.from(event.dataTransfer?.types ?? []).includes("Files");

    const onEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth += 1;
      setDragging(true);
    };
    const onOver = (event: DragEvent) => {
      if (hasFiles(event)) event.preventDefault();
    };
    const onLeave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onDrop = (event: DragEvent) => {
      event.preventDefault();
      depth = 0;
      setDragging(false);
      const file = event.dataTransfer?.files?.[0];
      if (file) void loadFile(file);
    };

    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [loadFile]);

  useEffect(() => {
    document.title = parsed ? `${parsed.fileName.split("/").pop()} — binlens` : "binlens — Mach-O inspector";
  }, [parsed]);

  const slice = parsed ? (parsed.slices[arch] ?? parsed.slices[0]) : null;

  const tabs = useMemo<TabDef[]>(() => {
    if (!slice) return [];
    return [
      { id: "overview", label: "Overview" },
      { id: "segments", label: "Segments", count: slice.segments.length },
      { id: "commands", label: "Commands", count: slice.loadCommands.length },
      { id: "libraries", label: "Libraries", count: slice.dylibs.length },
      { id: "signature", label: "Signature", count: slice.codeSignature?.blobs.length },
      { id: "strings", label: "Strings", count: slice.strings.length },
      { id: "hex", label: "Hex" },
    ];
  }, [slice]);

  const goToBytes = useCallback((offset: number, length: number, label: string) => {
    setJump((previous) => ({ offset, length, label, nonce: (previous?.nonce ?? 0) + 1 }));
    setTab("hex");
  }, []);

  const selfManaged = tab === "commands" || tab === "libraries" || tab === "strings" || tab === "hex";

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
            <circle cx="16" cy="16" r="10.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M10 13h12M10 16h12M10 19h7" stroke="currentColor" strokeWidth="1.6" />
            <circle cx="22" cy="22" r="1.8" fill="currentColor" />
          </svg>
          <span className="brand-name">binlens</span>
          <span className="brand-sub">Mach-O inspector</span>
        </div>

        <div className="topbar-right">
          {parsed && (
            <span className="topbar-file mono" title={parsed.fileName}>
              {parsed.fileName}
              <span className="topbar-size">{formatBytes(parsed.fileSize)}</span>
            </span>
          )}
          <button type="button" className="btn btn-ghost" onClick={openPicker}>
            Open file
            <kbd>⌘O</kbd>
          </button>
        </div>
      </header>

      <input
        ref={inputRef}
        type="file"
        className="visually-hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void loadFile(file);
          event.target.value = "";
        }}
      />

      {busy && (
        <div className="busy" role="status">
          <span className="spinner" aria-hidden="true" />
          Reading <span className="mono">{busy}</span>…
        </div>
      )}

      {error && (
        <div className="banner banner-error" role="alert">
          {error}
          <button type="button" className="btn btn-ghost btn-xs" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {!parsed && (
        <main className="landing">
          <div className="landing-inner">
            <p className="eyebrow">Read the binary, not the docs</p>
            <h1>Look inside a Mac executable.</h1>
            <p className="lede">
              Drop in any Mach-O file and see how it is put together: load commands, segments,
              linked libraries, code signature, entitlements, and the raw bytes behind them.
            </p>

            <DropZone onBrowse={openPicker} onSample={openSample} dragging={dragging} />

            <div className="landing-facts">
              <div>
                <h2>Written from the format</h2>
                <p>
                  No parsing libraries. Headers, load commands and the code-signature superblob are
                  read byte by byte from the spec.
                </p>
              </div>
              <div>
                <h2>Verified against Apple's tools</h2>
                <p>
                  Slices, linked libraries and entitlements are checked against{" "}
                  <span className="mono">lipo</span>, <span className="mono">otool</span> and{" "}
                  <span className="mono">codesign</span>.
                </p>
              </div>
              <div>
                <h2>Local and offline</h2>
                <p>
                  Your binary is read into this tab and parsed in a worker. Nothing is uploaded, and
                  no account is needed.
                </p>
              </div>
            </div>
          </div>
        </main>
      )}

      {parsed && parsed.slices.length === 0 && (
        <main className="landing">
          <div className="reject">
            <h1>That file could not be read</h1>
            <p className="lede">
              Nothing in <span className="mono">{parsed.fileName}</span> looks like a Mach-O binary.
              It may be an ELF or PE file, an archive, or a truncated download.
            </p>
            <ul className="reject-list">
              {parsed.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
            <div className="drop-actions">
              <button type="button" className="btn btn-primary" onClick={openPicker}>
                Try another file
              </button>
              <button type="button" className="btn btn-ghost" onClick={openSample}>
                Open the sample
              </button>
            </div>
          </div>
        </main>
      )}

      {parsed && slice && (
        <div className="shell">
          <Sidebar parsed={parsed} arch={arch} onSelect={setArch} durationMs={durationMs} />

          <main className="main">
            <TabBar tabs={tabs} active={tab} onChange={(id) => setTab(id as TabId)} />

            <div
              className={`tabpanel${selfManaged ? " tabpanel-fill" : ""}`}
              role="tabpanel"
              id="tabpanel"
              aria-labelledby={`tab-${tab}`}
            >
              {tab === "overview" && <OverviewTab parsed={parsed} slice={slice} />}
              {tab === "segments" && <SegmentsTab slice={slice} onJump={goToBytes} />}
              {tab === "commands" && <CommandsTab slice={slice} />}
              {tab === "libraries" && <LibrariesTab slice={slice} />}
              {tab === "signature" && <SignatureTab slice={slice} />}
              {tab === "strings" && <StringsTab slice={slice} />}
              {tab === "hex" && buffer && (
                <HexTab
                  key={slice.index}
                  buffer={buffer}
                  slice={slice}
                  jump={jump}
                  onJump={goToBytes}
                />
              )}
            </div>
          </main>
        </div>
      )}
    </div>
  );
}
