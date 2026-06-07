export interface TabItem {
  id: string;
  label: string;
  badge?: number;
}

interface Props {
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
}

/** Horizontal, scrollable tab strip for the Command Center sections. */
export function Tabs({ tabs, active, onChange }: Props) {
  return (
    <div className="bb-tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={tab.id === active}
          className={`bb-tab ${tab.id === active ? "active" : ""}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {typeof tab.badge === "number" && tab.badge > 0 && (
            <span className="bb-tab-badge">{tab.badge}</span>
          )}
        </button>
      ))}
    </div>
  );
}
