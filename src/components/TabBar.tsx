export interface TabDef {
  id: string;
  label: string;
  count?: number;
}

export function TabBar({
  tabs,
  active,
  onChange,
}: {
  tabs: TabDef[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="tabs" role="tablist" aria-label="Binary views">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={`tab-${tab.id}`}
          aria-selected={active === tab.id}
          aria-controls="tabpanel"
          tabIndex={active === tab.id ? 0 : -1}
          className={`tab${active === tab.id ? " tab-active" : ""}`}
          onClick={() => onChange(tab.id)}
          onKeyDown={(event) => {
            if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
            event.preventDefault();
            const at = tabs.findIndex((item) => item.id === active);
            const step = event.key === "ArrowRight" ? 1 : -1;
            const next = tabs[(at + step + tabs.length) % tabs.length];
            onChange(next.id);
            document.getElementById(`tab-${next.id}`)?.focus();
          }}
        >
          {tab.label}
          {tab.count !== undefined && <span className="tab-count">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}
