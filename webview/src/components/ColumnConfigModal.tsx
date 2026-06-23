import { useState } from "react";
import { AppConfig, BoardColumn, ColumnHook, GitStage } from "../types";
import { t } from "../i18n";
import { describeColumnAutomation } from "../columnAutomation";

interface Props {
  column: BoardColumn;
  allowedCommands: string[];
  policy: AppConfig["policy"];
  onClose: () => void;
  onSave: (id: string, patch: Partial<BoardColumn>) => void;
}

const GIT_STAGES: GitStage[] = ["none", "ai-agent", "feature", "review", "staging", "production"];

function newHook(): ColumnHook {
  return {
    id: `hook_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
    label: "",
    command: "npm",
    args: [],
    requireConfirm: true,
    requireCleanTree: false,
    continueOnError: false,
    timeoutSec: 120,
    blocking: false,
    enabled: true,
  };
}

export function ColumnConfigModal(props: Props) {
  const { column, allowedCommands } = props;
  const [nameEn, setNameEn] = useState(column.nameEn ?? "");
  const [gitStage, setGitStage] = useState<GitStage>(column.gitStage ?? "none");
  const [baseBranch, setBaseBranch] = useState(column.baseBranch ?? "");
  const [targetBranch, setTargetBranch] = useState(column.targetBranch ?? "");
  const [branchPrefix, setBranchPrefix] = useState(column.branchPrefix ?? "");
  const [wipLimit, setWipLimit] = useState<number>(column.wipLimit ?? 0);
  const [onEnter, setOnEnter] = useState<ColumnHook[]>(column.onEnter ?? []);
  const [onLeave, setOnLeave] = useState<ColumnHook[]>(column.onLeave ?? []);

  const commandKnown = (cmd: string) => allowedCommands.includes(cmd.trim());

  // Live preview of the built-in Git automation for the stage/branches currently being
  // edited (not yet saved), so the user sees the effect of their changes immediately.
  const draftColumn: BoardColumn = {
    ...column,
    gitStage,
    baseBranch: baseBranch.trim() || undefined,
    targetBranch: targetBranch.trim() || undefined,
    branchPrefix: branchPrefix.trim() || undefined,
  };
  const automation = describeColumnAutomation(draftColumn, props.policy);

  const save = () => {
    props.onSave(column.id, {
      nameEn: nameEn.trim() || undefined,
      gitStage,
      baseBranch: baseBranch.trim() || undefined,
      targetBranch: targetBranch.trim() || undefined,
      branchPrefix: branchPrefix.trim() || undefined,
      wipLimit: wipLimit > 0 ? wipLimit : undefined,
      onEnter,
      onLeave,
    });
    props.onClose();
  };

  const renderHookList = (
    hooks: ColumnHook[],
    setHooks: (h: ColumnHook[]) => void,
    titleKey: string
  ) => {
    const update = (i: number, patch: Partial<ColumnHook>) =>
      setHooks(hooks.map((h, idx) => (idx === i ? { ...h, ...patch } : h)));
    const remove = (i: number) => setHooks(hooks.filter((_, idx) => idx !== i));

    return (
      <div className="bb-cc-section">
        <div className="bb-cc-section-head">
          <strong>{t(titleKey)}</strong>
          <button className="bb-btn ghost" onClick={() => setHooks([...hooks, newHook()])}>
            + {t("columnConfig.addCommand")}
          </button>
        </div>
        {hooks.length === 0 && <div className="bb-cc-empty">{t("columnConfig.noCommands")}</div>}
        {hooks.map((h, i) => {
          const known = commandKnown(h.command);
          return (
            <div key={h.id} className={`bb-cc-hook ${h.enabled ? "" : "disabled"}`}>
              <div className="bb-cc-hook-row">
                <input
                  className="bb-input"
                  style={{ flex: 2 }}
                  placeholder={t("columnConfig.label")}
                  value={h.label}
                  onChange={(e) => update(i, { label: e.target.value })}
                />
                <button
                  className="bb-iconbtn danger"
                  title={t("columnConfig.removeCommand")}
                  onClick={() => remove(i)}
                >
                  ✕
                </button>
              </div>
              <div className="bb-cc-hook-row">
                <input
                  className={`bb-input ${known ? "" : "bb-input-error"}`}
                  style={{ flex: 1 }}
                  placeholder="npm"
                  value={h.command}
                  onChange={(e) => update(i, { command: e.target.value })}
                  title={known ? "" : t("columnConfig.notAllowed")}
                />
                <input
                  className="bb-input"
                  style={{ flex: 3 }}
                  placeholder="run lint  (space-separated args)"
                  value={h.args.join(" ")}
                  onChange={(e) =>
                    update(i, { args: e.target.value.split(/\s+/).filter(Boolean) })
                  }
                />
              </div>
              {!known && <div className="bb-cc-warn">⚠ {t("columnConfig.notAllowed")}</div>}
              <div className="bb-cc-flags">
                <label><input type="checkbox" checked={h.enabled} onChange={(e) => update(i, { enabled: e.target.checked })} /> {t("columnConfig.enabled")}</label>
                <label><input type="checkbox" checked={h.blocking} onChange={(e) => update(i, { blocking: e.target.checked })} /> {t("columnConfig.blocking")}</label>
                <label><input type="checkbox" checked={h.requireConfirm} onChange={(e) => update(i, { requireConfirm: e.target.checked })} /> {t("columnConfig.confirm")}</label>
                <label><input type="checkbox" checked={h.requireCleanTree} onChange={(e) => update(i, { requireCleanTree: e.target.checked })} /> {t("columnConfig.cleanTree")}</label>
                <label><input type="checkbox" checked={h.continueOnError} onChange={(e) => update(i, { continueOnError: e.target.checked })} /> {t("columnConfig.continueOnError")}</label>
                <label className="bb-cc-timeout">
                  {t("columnConfig.timeout")}
                  <input
                    type="number"
                    className="bb-input"
                    style={{ width: 64 }}
                    min={1}
                    value={h.timeoutSec}
                    onChange={(e) => update(i, { timeoutSec: Number(e.target.value) || 120 })}
                  />
                </label>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="bb-modal-overlay" onClick={props.onClose}>
      <div className="bb-modal bb-cc-modal" onClick={(e) => e.stopPropagation()}>
        <div className="bb-modal-head">
          <h2>{t("columnConfig.title")}: {column.name}</h2>
          <button className="bb-iconbtn" onClick={props.onClose}>✕</button>
        </div>

        <div className="bb-modal-body">
          <div className="bb-cc-grid">
            <label>{t("columnConfig.nameEn")}
              <input className="bb-input" value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="In Progress" />
            </label>
            <label>{t("columnConfig.gitStage")}
              <select className="bb-input" value={gitStage} onChange={(e) => setGitStage(e.target.value as GitStage)}>
                {GIT_STAGES.map((s) => (
                  <option key={s} value={s}>{t(`gitStage.${s}`)}</option>
                ))}
              </select>
            </label>
            <label>{t("columnConfig.baseBranch")}
              <input className="bb-input" value={baseBranch} onChange={(e) => setBaseBranch(e.target.value)} placeholder="dev" />
            </label>
            <label>{t("columnConfig.targetBranch")}
              <input className="bb-input" value={targetBranch} onChange={(e) => setTargetBranch(e.target.value)} placeholder="dev / main" />
            </label>
            <label>{t("columnConfig.branchPrefix")}
              <input className="bb-input" value={branchPrefix} onChange={(e) => setBranchPrefix(e.target.value)} placeholder="feature/" />
            </label>
            <label>{t("columnConfig.wipLimit")}
              <input type="number" min={0} className="bb-input" value={wipLimit} onChange={(e) => setWipLimit(Number(e.target.value) || 0)} />
            </label>
          </div>

          <div className={`bb-cc-automation ${automation.disabled ? "warn" : ""}`}>
            <div className="bb-cc-automation-head">
              <strong>{t("columnConfig.automation.title")}</strong>
              {automation.branchLabel && (
                <span className="bb-cc-automation-branch">{automation.branchLabel}</span>
              )}
            </div>
            <p>{automation.description}</p>
            {automation.disabled && (
              <p className="bb-cc-automation-warning">
                ⚠ {t("columnConfig.automation.disabledWarning")}
              </p>
            )}
          </div>

          <div className="bb-cc-note">{t("columnConfig.automation.customNote")}</div>

          {renderHookList(onEnter, setOnEnter, "columnConfig.onEnter")}
          {renderHookList(onLeave, setOnLeave, "columnConfig.onLeave")}

          <div className="bb-cc-note">{t("columnConfig.securityNote")}</div>
        </div>

        <div className="bb-modal-foot">
          <button className="bb-btn ghost" onClick={props.onClose}>{t("board.cancel")}</button>
          <button className="bb-btn accent" onClick={save}>{t("columnConfig.save")}</button>
        </div>
      </div>
    </div>
  );
}
