import type { ParsedBinary } from "../lib/macho/types.ts";
import { formatBytes } from "../lib/macho/reader.ts";
import { Badge } from "./ui.tsx";

export function Sidebar({
  parsed,
  arch,
  onSelect,
  durationMs,
}: {
  parsed: ParsedBinary;
  arch: number;
  onSelect: (index: number) => void;
  durationMs: number | null;
}) {
  const slice = parsed.slices[arch] ?? parsed.slices[0];
  const directory = slice?.codeSignature?.codeDirectory ?? null;

  return (
    <aside className="sidebar">
      <div className="side-block">
        <div className="side-label">File</div>
        <div className="side-file mono" title={parsed.fileName}>
          {parsed.fileName}
        </div>
        <div className="side-meta">
          <span className="mono">{formatBytes(parsed.fileSize)}</span>
          <Badge tone={parsed.container === "fat" ? "accent" : "neutral"}>
            {parsed.container === "fat" ? `universal · ${parsed.fatArchCount}` : "thin"}
          </Badge>
        </div>
      </div>

      <div className="side-block">
        <div className="side-label">
          Architectures
          <span className="side-count">{parsed.slices.length}</span>
        </div>
        <ul className="arch-list">
          {parsed.slices.map((item) => (
            <li key={item.index}>
              <button
                type="button"
                className={`arch${item.index === arch ? " arch-active" : ""}`}
                onClick={() => onSelect(item.index)}
                aria-pressed={item.index === arch}
              >
                <span className="arch-name">{item.cpuName}</span>
                <span className="arch-sub">{item.subtypeName}</span>
                <span className="arch-size mono">{formatBytes(item.size)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {slice && (
        <div className="side-block">
          <div className="side-label">Facts</div>
          <dl className="side-facts">
            <div>
              <dt>Signed</dt>
              <dd>{slice.codeSignature ? directory?.identifier || "yes" : "no"}</dd>
            </div>
            <div>
              <dt>Team</dt>
              <dd className="mono">{directory?.teamId || "—"}</dd>
            </div>
            <div>
              <dt>Min OS</dt>
              <dd className="mono">{slice.buildVersion?.minos ?? slice.minOs?.minos ?? "—"}</dd>
            </div>
            <div>
              <dt>Symbols</dt>
              <dd className="mono">{slice.symtab?.symbols ?? "—"}</dd>
            </div>
            <div>
              <dt>Encrypted</dt>
              <dd>{slice.encrypted ? "yes" : "no"}</dd>
            </div>
          </dl>
        </div>
      )}

      {parsed.warnings.length > 0 && (
        <div className="side-block">
          <div className="side-label">Warnings</div>
          <ul className="side-warnings">
            {parsed.warnings.slice(0, 4).map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
            {parsed.warnings.length > 4 && (
              <li className="muted">and {parsed.warnings.length - 4} more…</li>
            )}
          </ul>
        </div>
      )}

      <div className="side-foot">
        {durationMs !== null && (
          <span className="mono">
            parsed in {durationMs < 1 ? "<1" : Math.round(durationMs)} ms
          </span>
        )}
        <p>Bytes never leave this tab. Parsing runs in a worker.</p>
        <a href="https://github.com/Taiwo555/binlens" target="_blank" rel="noreferrer">
          Source ↗
        </a>
      </div>
    </aside>
  );
}
