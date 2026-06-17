import { t } from "../../i18n";
import { Tooltip } from "../common/Tooltip";

export type AppView = "board" | "today" | "currentBranch" | "command" | "branchMap";

interface Props {
  page: AppView;
  onNavigate: (view: AppView) => void;
}

const ITEMS: Array<{ id: AppView; labelKey: string; tipKey: string }> = [
  { id: "board", labelKey: "nav.board", tipKey: "tooltips.nav.board" },
  { id: "today", labelKey: "nav.today", tipKey: "tooltips.nav.today" },
  { id: "currentBranch", labelKey: "nav.currentBranch", tipKey: "tooltips.nav.currentBranch" },
  { id: "command", labelKey: "nav.commandCenter", tipKey: "tooltips.nav.commandCenter" },
  { id: "branchMap", labelKey: "nav.branchMap", tipKey: "tooltips.nav.branchMap" },
];

/** Persistent view switcher used across all top-level pages. */
export function MainNav({ page, onNavigate }: Props) {
  return (
    <nav className="bb-mainnav" aria-label={t("nav.view")}>
      {ITEMS.map((it) => (
        <Tooltip key={it.id} text={t(it.tipKey)}>
          <button
            className={`bb-nav-btn ${page === it.id ? "active" : ""}`}
            aria-current={page === it.id ? "page" : undefined}
            onClick={() => onNavigate(it.id)}
          >
            {t(it.labelKey)}
          </button>
        </Tooltip>
      ))}
    </nav>
  );
}
