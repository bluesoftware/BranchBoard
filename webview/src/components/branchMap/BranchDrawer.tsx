import { useEffect } from "react";
import { AppConfig, BoardData, BranchDetail, BranchFlowRow } from "../../types";
import { t } from "../../i18n";
import { formatDate, relativeTime } from "../../utils";
import { Badge, BadgeTone } from "../common/Badge";
import { Tooltip } from "../common/Tooltip";
import { CopyIcon, FileIcon } from "../Icons";

interface Props {
  row: BranchFlowRow;
  board: BoardData;
  appConfig: AppConfig;
  detail: BranchDetail | null;
  loading: boolean;
  onClose: () => void;
  onRequestDetail: (branchName: string) => void;
  onCheckout: (branchName: string) => void;
  onPush: (branchName: string) => void;
  onDeployDev: (taskId: string) => void;
  onOpenTask: (taskId: string) => void;
  onCreateTaskFromBranch: (branchName: string) => void;
  onCopy: (text: string, label: string) => void;
  onCopyAiPrompt: (taskId: string) => void;
  onOpenFile: (path: string) => void;
  onOpenDiff: (branchName: string, path: string) => void;
  onDeleteLocal: (branchName: string) => void;
  onDeleteRemote: (branchName: string) => void;
  onArchive: (branchName: string) => void;
}

const RISK_TONE: Record<string, BadgeTone> = {
  critical: "critical",
  high: "high",
  medium: "medium",
  low: "low",
};
const STATUS_TONE: Record<string, BadgeTone> = {
  A: "success",
  M: "warning",
  D: "critical",
  R: "info",
  C: "info",
};

function timeLabels() {
  return { now: t("cc.time.now"), m: t("cc.time.m"), h: t("cc.time.h"), d: t("cc.time.d") };
}

/** Right-side details panel for a single branch (opened from Branch Map). */
export function BranchDrawer(props: Props) {
  const { row, board, appConfig, detail } = props;
  const info = row.info;
  const branch = row.branchName;
  const ready = detail && detail.branchName === branch && !props.loading;
  const user = board.users.find((u) => u.id === row.assignedUserId);
  const devCommand = appConfig.policy.devDeployCommand;

  useEffect(() => {
    props.onRequestDetail(branch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch]);

  // Impact areas this branch touches (matched on changed file paths).
  const impactAreas = (appConfig.policy.impactAreas ?? [])
    .filter((area) =>
      info.changedFiles.some((f) => area.paths.some((p) => f.toLowerCase().includes(p.toLowerCase())))
    )
    .map((a) => a.name);

  const copyChangedFiles = () => {
    const files = ready ? detail!.files.map((f) => `${f.status}\t${f.path}`).join("\n") : info.changedFiles.join("\n");
    props.onCopy(files, t("cc.files.filesCopied"));
  };

  return (
    <div className="bb-drawer-overlay" onMouseDown={props.onClose}>
      <aside className="bb-drawer bb-taskdrawer" onMouseDown={(e) => e.stopPropagation()}>
        <div className="bb-drawer-head">
          <code className="bb-drawer-title" style={{ fontSize: 14 }}>
            {info.current ? "● " : ""}
            {branch}
          </code>
          <button className="bb-iconbtn" onClick={props.onClose} title={t("settings.close")}>
            ✕
          </button>
        </div>

        <div className="bb-drawer-body">
          {/* Info */}
          <div className="bb-card">
            <div className="bb-lane-badges" style={{ marginLeft: 0 }}>
              <Tooltip text={t("tooltips.risk.score")}>
                <Badge tone={RISK_TONE[row.riskLevel]}>{t(`branchMap.risk${cap(row.riskLevel)}`)}</Badge>
              </Tooltip>
              {info.deployedToDev && <Badge tone="info">DEV</Badge>}
              {row.stale && <Badge tone="warning">{t("cc.flow.staleBadge")}</Badge>}
              {!info.existsRemote && info.commitsAheadMain > 0 && (
                <Badge tone="medium">{t("cc.flow.notPushedBadge")}</Badge>
              )}
            </div>
            <dl className="bb-git-status">
              <dt>{t("currentBranch.ahead")} / {t("currentBranch.behind")}</dt>
              <dd>↑{info.commitsAheadMain} ↓{info.commitsBehindMain}</dd>
              <dt>{t("branchMap.changedFiles")}</dt>
              <dd>{info.changedFilesCount}</dd>
              <dt>{t("cc.flow.lastCommit")}</dt>
              <dd>{relativeTime(info.lastCommitAt, timeLabels())}</dd>
              <dt>{t("task.assignee")}</dt>
              <dd>{user ? user.name : "—"}</dd>
            </dl>
            {impactAreas.length > 0 && (
              <div className="bb-impact-chips">
                <span className="bb-muted small">{t("impact.areas")}:</span>
                {impactAreas.map((name) => (
                  <Badge key={name} tone="neutral">{name}</Badge>
                ))}
              </div>
            )}
          </div>

          {/* Task */}
          <div className="bb-card">
            <div className="bb-section-head">
              <span className="bb-section-title">{t("branchMap.task")}</span>
            </div>
            {row.taskId && row.taskTitle ? (
              <div className="bb-git-actions">
                <span className="bb-cb-tasktitle">{row.taskTitle}</span>
                <button className="bb-btn" onClick={() => props.onOpenTask(row.taskId!)}>
                  {t("branchMap.openTask")}
                </button>
              </div>
            ) : (
              <>
                <div className="bb-muted small">{t("tooltips.branchMap.branchWithoutTask")}</div>
                <button className="bb-btn accent" onClick={() => props.onCreateTaskFromBranch(branch)}>
                  {t("branchMap.createTaskFromBranch")}
                </button>
              </>
            )}
          </div>

          {/* Actions */}
          <div className="bb-card">
            <div className="bb-section-head">
              <span className="bb-section-title">{t("currentBranch.actions")}</span>
            </div>
            <div className="bb-git-actions">
              <Tooltip text={t("tooltips.git.checkout")}>
                <button className="bb-btn" disabled={info.current || !info.existsLocal} onClick={() => props.onCheckout(branch)}>
                  {t("branchMap.checkoutBranch")}
                </button>
              </Tooltip>
              <Tooltip text={t("tooltips.git.push")}>
                <button className="bb-btn" onClick={() => props.onPush(branch)}>
                  {t("currentBranch.pushBranch")}
                </button>
              </Tooltip>
              <Tooltip text={t("tooltips.deploy.dev")}>
                <button className="bb-btn" disabled={!row.taskId || !devCommand} onClick={() => row.taskId && props.onDeployDev(row.taskId)}>
                  {t("branchMap.deployToDev")}
                </button>
              </Tooltip>
              <button className="bb-btn" onClick={() => props.onCopy(branch, t("cc.flow.branchCopied"))}>
                <CopyIcon size={12} />
                {t("currentBranch.copyBranchName")}
              </button>
              <button className="bb-btn" onClick={copyChangedFiles}>
                <CopyIcon size={12} />
                {t("branchMap.copyChangedFiles")}
              </button>
              {row.taskId && (
                <Tooltip text={t("tooltips.ai.copyPrompt")}>
                  <button className="bb-btn" onClick={() => props.onCopyAiPrompt(row.taskId!)}>
                    {t("branchMap.copyAiReviewPrompt")}
                  </button>
                </Tooltip>
              )}
            </div>

            {/* Cleanup — destructive, each confirmed in the extension host */}
            <div className="bb-section-subtitle">{t("branchMap.cleanup")}</div>
            <div className="bb-git-actions">
              <Tooltip text={t("tooltips.branchMap.archive")}>
                <button className="bb-btn" disabled={info.current || !info.existsLocal} onClick={() => props.onArchive(branch)}>
                  {t("branchMap.archive")}
                </button>
              </Tooltip>
              <Tooltip text={t("tooltips.branchMap.deleteLocal")}>
                <button className="bb-btn danger" disabled={info.current || !info.existsLocal} onClick={() => props.onDeleteLocal(branch)}>
                  {t("branchMap.deleteLocal")}
                </button>
              </Tooltip>
              <Tooltip text={t("tooltips.branchMap.deleteRemote")}>
                <button className="bb-btn danger" disabled={!info.existsRemote} onClick={() => props.onDeleteRemote(branch)}>
                  {t("branchMap.deleteRemote")}
                </button>
              </Tooltip>
            </div>
          </div>

          {/* Changed files */}
          <div className="bb-card">
            <div className="bb-section-head">
              <span className="bb-section-title">{t("cc.files.changedFiles")}</span>
              {ready && detail!.files.length > 0 && <span className="bb-count">{detail!.files.length}</span>}
            </div>
            {props.loading || !ready ? (
              <div className="bb-muted small">{t("cc.files.loading")}</div>
            ) : detail!.files.length === 0 ? (
              <div className="bb-muted small">{t("cc.files.noFiles")}</div>
            ) : (
              <ul className="bb-files-filelist">
                {detail!.files.map((f) => (
                  <li key={f.path} className="bb-file-row">
                    <span className={`bb-badge ${STATUS_TONE[f.status] ?? "tone-neutral"}`}>{f.status}</span>
                    <span className="bb-file-path" onClick={() => props.onOpenFile(f.path)} title={t("task.files.open")}>
                      {f.path}
                    </span>
                    <button className="bb-btn ghost sm" onClick={() => props.onOpenDiff(branch, f.path)}>
                      {t("task.files.diff")}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Commits */}
          <div className="bb-card">
            <div className="bb-section-head">
              <span className="bb-section-title">{t("cc.files.commits")}</span>
              {ready && detail!.commits.length > 0 && <span className="bb-count">{detail!.commits.length}</span>}
            </div>
            {props.loading || !ready ? (
              <div className="bb-muted small">{t("cc.files.loading")}</div>
            ) : detail!.commits.length === 0 ? (
              <div className="bb-muted small">{t("currentBranch.noCommits")}</div>
            ) : (
              <ul className="bb-commit-list">
                {detail!.commits.map((c) => (
                  <li key={c.hash} className="bb-commit-row">
                    <code className="bb-commit-hash" title={t("task.files.open")} onClick={() => props.onCopy(c.hash, c.shortHash)}>
                      {c.shortHash}
                    </code>
                    <span className="bb-commit-subject">{c.subject}</span>
                    <span className="bb-commit-meta">{c.author} · {formatDate(c.date)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bb-cb-meta" style={{ paddingLeft: 2 }}>
            <FileIcon size={11} /> {t("branchMap.files")}: {info.changedFilesCount}
          </div>
        </div>
      </aside>
    </div>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
