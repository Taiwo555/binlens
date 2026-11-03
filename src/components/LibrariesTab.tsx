import type { Slice } from "../lib/macho/types.ts";
import { CopyButton, Empty } from "./ui.tsx";

const KIND_LABEL: Record<string, string> = {
  LC_LOAD_DYLIB: "load",
  LC_LOAD_WEAK_DYLIB: "weak",
  LC_REEXPORT_DYLIB: "re-export",
  LC_LAZY_LOAD_DYLIB: "lazy",
  LC_LOAD_UPWARD_DYLIB: "upward",
  LC_ID_DYLIB: "install name",
};

export function LibrariesTab({ slice }: { slice: Slice }) {
  if (slice.dylibs.length === 0) {
    return (
      <Empty title="No linked libraries">
        This binary does not load any dynamic libraries. Statically linked binaries look like this.
      </Empty>
    );
  }

  return (
    <div className="stack fill">
      <div className="scroll-area">
        <table className="table table-sticky">
          <thead>
            <tr>
              <th className="num">#</th>
              <th>Kind</th>
              <th>Install name</th>
              <th>Current</th>
              <th>Compatible</th>
            </tr>
          </thead>
          <tbody>
            {slice.dylibs.map((dylib, index) => (
              <tr key={`${dylib.name}-${index}`}>
                <td className="num mono muted-cell">{index}</td>
                <td>
                  <span className="tag">{KIND_LABEL[dylib.kind] ?? dylib.kind}</span>
                </td>
                <td className="mono path-cell">
                  {dylib.name}
                  <CopyButton value={dylib.name} label="Copy" />
                </td>
                <td className="mono">{dylib.currentVersion}</td>
                <td className="mono muted-cell">{dylib.compatibilityVersion}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
