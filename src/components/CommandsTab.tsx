import { useMemo, useState } from "react";
import type { Slice } from "../lib/macho/types.ts";
import { Empty } from "./ui.tsx";

export function CommandsTab({ slice }: { slice: Slice }) {
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return slice.loadCommands;
    return slice.loadCommands.filter(
      (command) =>
        command.name.toLowerCase().includes(needle) || command.summary.toLowerCase().includes(needle),
    );
  }, [query, slice.loadCommands]);

  if (slice.loadCommands.length === 0) {
    return <Empty title="No load commands">This slice has no command table to read.</Empty>;
  }

  return (
    <div className="stack fill">
      <div className="toolbar">
        <input
          className="search"
          placeholder="Filter commands or their contents"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Filter load commands"
        />
        <span className="toolbar-count">
          {rows.length} of {slice.loadCommands.length}
        </span>
      </div>

      <div className="scroll-area">
        <table className="table table-sticky">
          <thead>
            <tr>
              <th className="num">#</th>
              <th>Command</th>
              <th className="num">Size</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((command) => (
              <tr key={`${command.index}-${command.cmd}`}>
                <td className="num mono muted-cell">{command.index}</td>
                <td className="mono strong">{command.name}</td>
                <td className="num mono muted-cell">{command.cmdsize}</td>
                <td className="mono summary-cell">{command.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <Empty title="Nothing matches">No load command contains “{query}”.</Empty>}
      </div>
    </div>
  );
}
