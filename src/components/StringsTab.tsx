import { useDeferredValue, useMemo, useState } from "react";
import type { Slice } from "../lib/macho/types.ts";
import { formatBytes } from "../lib/macho/reader.ts";
import { CopyButton, Empty } from "./ui.tsx";
import { VirtualList } from "./VirtualList.tsx";

const ROW_HEIGHT = 26;

function highlight(text: string, needle: string) {
  if (!needle) return text;
  const at = text.toLowerCase().indexOf(needle);
  if (at === -1) return text;
  return (
    <>
      {text.slice(0, at)}
      <mark>{text.slice(at, at + needle.length)}</mark>
      {text.slice(at + needle.length)}
    </>
  );
}

export function StringsTab({ slice }: { slice: Slice }) {
  const [query, setQuery] = useState("");
  const [section, setSection] = useState("*");
  const deferred = useDeferredValue(query.trim().toLowerCase());

  const sectionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const hit of slice.strings) {
      counts.set(hit.section, (counts.get(hit.section) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [slice.strings]);

  const rows = useMemo(() => {
    return slice.strings.filter((hit) => {
      if (section !== "*" && hit.section !== section) return false;
      if (deferred && !hit.value.toLowerCase().includes(deferred)) return false;
      return true;
    });
  }, [slice.strings, section, deferred]);

  if (slice.strings.length === 0) {
    return (
      <Empty title="No strings found">
        This slice has no sections the extractor recognises as text. Object files and stripped
        binaries often look like this.
      </Empty>
    );
  }

  return (
    <div className="stack fill">
      <div className="toolbar">
        <input
          className="search"
          type="search"
          placeholder="Search strings"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search strings"
        />
        <select
          className="select"
          value={section}
          onChange={(event) => setSection(event.target.value)}
          aria-label="Filter by section"
        >
          <option value="*">All sections ({slice.strings.length})</option>
          {sectionCounts.map(([name, count]) => (
            <option key={name} value={name}>
              {name || "(no section)"} ({count})
            </option>
          ))}
        </select>
        <span className="toolbar-count">
          {rows.length === slice.strings.length
            ? `${rows.length} strings`
            : `${rows.length} of ${slice.strings.length}`}
        </span>
      </div>

      {slice.strings.length >= 20_000 && (
        <p className="toolbar-note">
          Extraction stopped at the 20,000-string ceiling. Narrow the view by section to see the
          rest of what was captured.
        </p>
      )}

      <div className="str-head" aria-hidden="true">
        <span>Offset</span>
        <span>Section</span>
        <span>Value</span>
        <span />
      </div>

      {rows.length === 0 ? (
        <Empty title="No match">
          Nothing in {section === "*" ? "this slice" : section} contains “{query}”.
        </Empty>
      ) : (
        <VirtualList
          key={`${section}:${deferred}`}
          items={rows}
          rowHeight={ROW_HEIGHT}
          className="str-list"
          renderRow={(hit) => (
            <div className="str-row" style={{ height: ROW_HEIGHT }}>
              <span className="str-off mono">{hit.fileOffset.toString(16).padStart(6, "0")}</span>
              <span className="str-sec">{hit.section || hit.segname || "—"}</span>
              <span className="str-val mono" title={hit.value}>
                {highlight(hit.value, deferred)}
              </span>
              <CopyButton value={hit.value} label="Copy" />
            </div>
          )}
        />
      )}

      <p className="pane-foot">
        {formatBytes(slice.size)} scanned · ASCII from text sections, UTF-16 from{" "}
        <span className="mono">__ustring</span> · runs shorter than four characters are discarded
        as noise.
      </p>
    </div>
  );
}
