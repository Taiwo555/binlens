export function DropZone({
  onBrowse,
  onSample,
  dragging,
}: {
  onBrowse: () => void;
  onSample: () => void;
  dragging: boolean;
}) {
  return (
    <div
      className={`drop${dragging ? " drop-active" : ""}`}
      onClick={onBrowse}
    >
      <svg className="drop-icon" viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r="21" fill="none" stroke="currentColor" strokeWidth="2" />
        <path
          d="M21 26h22M21 32h22M21 38h13"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="44" cy="42" r="3" fill="currentColor" />
      </svg>

      <h2>{dragging ? "Drop to inspect" : "Drop a Mach-O binary"}</h2>
      <p>
        Executables, <span className="mono">.dylib</span> files, app bundles — anything macOS ships
        as a compiled binary.
      </p>

      <div className="drop-actions" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="btn btn-primary" onClick={onBrowse}>
          Choose a file
        </button>
        <button type="button" className="btn btn-ghost" onClick={onSample}>
          Open the sample
        </button>
      </div>

      <p className="drop-note">
        Nothing is uploaded. The file is read into this tab and parsed by a worker; closing the page
        discards it.
      </p>
    </div>
  );
}
