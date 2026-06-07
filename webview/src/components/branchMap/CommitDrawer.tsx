import { useEffect } from "react";
import { CommitDetail } from "../../types";
import { t } from "../../i18n";
import { formatDate } from "../../utils";
import { Badge, BadgeTone } from "../common/Badge";
import { CopyIcon } from "../Icons";

interface Props {
  hash: string;
  detail: CommitDetail | null;
  loading: boolean;
  onClose: () => void;
  onRequestDetail: (hash: string) => void;
  onCopy: (text: string, label: string) => void;
  onOpenFile: (path: string) => void;
  onOpenCommitDiff: (hash: string, path: string) => void;
}

const STATUS_TONE: Record<string, BadgeTone> = {
  A: "success",
  M: "warning",
  D: "critical",
  R: "info",
  C: "info",
};

/** Right-side panel with a single commit's details + its changed files. */
export function CommitDrawer(props: Props) {
  const { hash, detail } = props;
  const ready = detail && detail.hash.startsWith(hash.slice(0, 7)) && !props.loading;

  useEffect(() => {
    props.onRequestDetail(hash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash]);

  const copySummary = () => {
    if (!detail) {
      return;
    }
    const lines = [
      `${detail.shortHash} ${detail.subject}`,
      `${detail.author} · ${formatDate(detail.date)}`,
      ...detail.files.map((f) => `${f.status}\t${f.path}`),
    ];
    props.onCopy(lines.join("\n"), t("commit.summaryCopied"));
  };

  return (
    <div className="bb-drawer-overlay" onMouseDown={props.onClose}>
      <aside className="bb-drawer bb-taskdrawer" onMouseDown={(e) => e.stopPropagation()}>
        <div className="bb-drawer-head">
          <code className="bb-drawer-title" style={{ fontSize: 13 }}>
            {hash.slice(0, 10)}
          </code>
          <button className="bb-iconbtn" onClick={props.onClose} title={t("settings.close")}>
            ✕
          </button>
        </div>

        <div className="bb-drawer-body">
          {!ready ? (
            <div className="bb-muted small">{t("commit.loading")}</div>
          ) : detail!.error ? (
            <div className="bb-callout warn">{detail!.error}</div>
          ) : (
            <>
              <div className="bb-card">
                <div className="bb-commit-subject" style={{ fontWeight: 600, fontSize: 13 }}>
                  {detail!.subject}
                </div>
                <div className="bb-cb-meta">
                  <span>{detail!.author}</span>
                  <span>{formatDate(detail!.date)}</span>
                  <code
                    className="bb-commit-hash"
                    title={t("commit.copyHash")}
                    onClick={() => props.onCopy(detail!.hash, detail!.shortHash)}
                  >
                    {detail!.shortHash}
                  </code>
                </div>
                <div className="bb-git-actions">
                  <button className="bb-btn" onClick={() => props.onCopy(detail!.hash, detail!.shortHash)}>
                    <CopyIcon size={12} /> {t("commit.copyHash")}
                  </button>
                  <button className="bb-btn" onClick={copySummary}>
                    <CopyIcon size={12} /> {t("commit.copySummary")}
                  </button>
                </div>
              </div>

              <div className="bb-card">
                <div className="bb-section-head">
                  <span className="bb-section-title">{t("cc.files.changedFiles")}</span>
                  {detail!.files.length > 0 && <span className="bb-count">{detail!.files.length}</span>}
                </div>
                {detail!.files.length === 0 ? (
                  <div className="bb-muted small">{t("cc.files.noFiles")}</div>
                ) : (
                  <ul className="bb-files-filelist">
                    {detail!.files.map((f) => (
                      <li key={f.path} className="bb-file-row">
                        <span className={`bb-badge ${STATUS_TONE[f.status] ?? "tone-neutral"}`}>{f.status}</span>
                        <span className="bb-file-path" onClick={() => props.onOpenFile(f.path)} title={t("task.files.open")}>
                          {f.path}
                        </span>
                        <span className="bb-file-num">
                          <span className="add">+{f.additions}</span> <span className="del">−{f.deletions}</span>
                        </span>
                        <button className="bb-btn ghost sm" onClick={() => props.onOpenCommitDiff(detail!.hash, f.path)}>
                          {t("task.files.diff")}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
