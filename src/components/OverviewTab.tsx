import type { ParsedBinary, Slice } from "../lib/macho/types.ts";
import { formatBytes } from "../lib/macho/reader.ts";
import { Badge, Card, CopyButton, Stat } from "./ui.tsx";

export function OverviewTab({ parsed, slice }: { parsed: ParsedBinary; slice: Slice }) {
  const signature = slice.codeSignature;
  const directory = signature?.codeDirectory ?? null;
  const platform = slice.buildVersion?.minos ?? slice.minOs?.minos ?? "—";
  const sdk = slice.buildVersion?.sdk ?? slice.minOs?.sdk ?? "—";

  return (
    <div className="stack">
      <div className="stat-grid">
        <Stat label="Architecture" value={slice.cpuName} hint={slice.subtypeName} />
        <Stat label="File type" value={slice.filetypeName} hint={slice.is64 ? "64-bit" : "32-bit"} />
        <Stat label="Slice size" value={formatBytes(slice.size)} hint={`offset 0x${slice.offset.toString(16)}`} />
        <Stat label="Load commands" value={slice.ncmds} hint={`${formatBytes(slice.sizeofcmds)} of table`} />
        <Stat label="Segments" value={slice.segments.length} hint={`${slice.sections.length} sections`} />
        <Stat label="Linked libraries" value={slice.dylibs.length} hint={`${slice.rpaths.length} rpath${slice.rpaths.length === 1 ? "" : "s"}`} />
        <Stat
          label="Entry point"
          value={slice.entryPoint ? `0x${slice.entryPoint.fileOffset.toString(16)}` : "—"}
          hint={slice.entryPoint ? "LC_MAIN" : "no LC_MAIN"}
        />
        <Stat label="Minimum OS" value={platform} hint={`sdk ${sdk}`} />
        <Stat label="Source version" value={slice.sourceVersion ?? "—"} />
        <Stat
          label="Signed"
          value={signature ? <Badge tone="accent">yes</Badge> : <Badge tone="warn">no</Badge>}
          hint={directory?.hashType ?? "no code signature"}
        />
      </div>

      <Card
        title="UUID"
        action={<CopyButton value={slice.uuid ?? ""} label="Copy UUID" />}
        subtitle="Identifies this exact build. Two binaries with the same UUID are the same artefact."
      >
        <div className="mono-line">{slice.uuid ?? "No LC_UUID command"}</div>
      </Card>

      {slice.flagNames.length > 0 && (
        <Card title="Header flags" subtitle="Loader behaviour bits from the Mach header.">
          <div className="chips">
            {slice.flagNames.map((flag) => (
              <span className="chip" key={flag}>
                {flag}
              </span>
            ))}
          </div>
        </Card>
      )}

      {directory && (
        <Card title="Code directory" subtitle="Who signed this binary, and with what.">
          <div className="kv">
            <div>
              <dt>Identifier</dt>
              <dd className="mono">
                {directory.identifier || "—"}
                <CopyButton value={directory.identifier} />
              </dd>
            </div>
            <div>
              <dt>Team ID</dt>
              <dd className="mono">
                {directory.teamId || "—"}
                {directory.teamId && <CopyButton value={directory.teamId} />}
              </dd>
            </div>
            <div>
              <dt>Hash</dt>
              <dd className="mono">
                {directory.hashType}
                {directory.hashSize ? ` (${directory.hashSize} bytes)` : ""}
              </dd>
            </div>
            <div>
              <dt>Pages</dt>
              <dd className="mono">
                {directory.codeSlots} code · {directory.specialSlots} special · {formatBytes(directory.pageSize)}
              </dd>
            </div>
          </div>
        </Card>
      )}

      {slice.rpaths.length > 0 && (
        <Card title="Run paths" subtitle="Directories dyld searches for @rpath libraries.">
          <ul className="plain-list">
            {slice.rpaths.map((path) => (
              <li key={path} className="mono">
                {path}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {parsed.warnings.length > 0 && (
        <Card title="Parser notes" subtitle="Recoverable problems found while reading this file.">
          <ul className="plain-list warn">
            {parsed.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
