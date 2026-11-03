import type { Slice } from "../lib/macho/types.ts";
import { formatBytes } from "../lib/macho/reader.ts";
import { Empty } from "./ui.tsx";

function protection(value: number): string {
  return `${value & 1 ? "r" : "-"}${value & 2 ? "w" : "-"}${value & 4 ? "x" : "-"}`;
}

export function SegmentsTab({
  slice,
  onJump,
}: {
  slice: Slice;
  onJump: (absoluteOffset: number, length: number, label: string) => void;
}) {
  if (slice.segments.length === 0) {
    return <Empty title="No segments">This slice declares no LC_SEGMENT commands.</Empty>;
  }

  return (
    <div className="stack">
      {slice.segments.map((segment) => (
        <section className="card card-flush" key={`${segment.name}-${segment.vmaddr}`}>
          <header className="seg-head">
            <div className="seg-title">
              <h2>{segment.name || "(unnamed)"}</h2>
              <span className="seg-prot mono">{protection(segment.initprot)}</span>
              <span className="seg-prot mono muted">{protection(segment.maxprot)}</span>
            </div>
            <dl className="seg-facts">
              <div>
                <dt>vmaddr</dt>
                <dd className="mono">0x{segment.vmaddr.toString(16)}</dd>
              </div>
              <div>
                <dt>vmsize</dt>
                <dd className="mono">{formatBytes(segment.vmsize)}</dd>
              </div>
              <div>
                <dt>file</dt>
                <dd className="mono">
                  0x{segment.fileoff.toString(16)}+{formatBytes(segment.filesize)}
                </dd>
              </div>
              <div>
                <dt>sections</dt>
                <dd className="mono">{segment.sections.length}</dd>
              </div>
            </dl>
          </header>

          {segment.sections.length > 0 ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Section</th>
                  <th>Address</th>
                  <th>Size</th>
                  <th>Offset</th>
                  <th>Type</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {segment.sections.map((section) => (
                  <tr key={`${section.segname}-${section.name}-${section.addr}`}>
                    <td className="mono strong">{section.name}</td>
                    <td className="mono muted-cell">0x{section.addr.toString(16)}</td>
                    <td className="mono">{formatBytes(section.size)}</td>
                    <td className="mono muted-cell">
                      {section.size === 0 ? "—" : `0x${section.offset.toString(16)}`}
                    </td>
                    <td>
                      <span className="tag">{section.typeName}</span>
                    </td>
                    <td className="right">
                      {section.size > 0 && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs"
                          onClick={() =>
                            onJump(
                              slice.offset + section.offset,
                              section.size,
                              `${section.segname},${section.name}`,
                            )
                          }
                        >
                          View bytes
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="seg-empty">No sections in this segment.</p>
          )}
        </section>
      ))}
    </div>
  );
}
