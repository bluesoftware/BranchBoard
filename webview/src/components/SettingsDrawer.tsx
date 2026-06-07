import { useState } from "react";
import { AppConfig, BoardData, ConnectionTestResult, GitInfo } from "../types";
import { t } from "../i18n";
import { HelpIcon } from "./common/HelpIcon";

interface Props {
  board: BoardData;
  git: GitInfo | null;
  appConfig: AppConfig;
  currentUserId: string | null;
  connectionStatus: ConnectionTestResult | null;
  connectionTesting: boolean;
  onClose: () => void;
  onSave: (patch: Record<string, unknown>) => void;
  onAddUser: (name: string, email: string) => void;
  onDeleteUser: (userId: string) => void;
  onSyncUsers: () => void;
  onSyncNow: () => void;
  onSelectSshKey: () => void;
  onTestConnection: () => void;
  onShowLogs: () => void;
}

type Tab = "general" | "git" | "users" | "appearance" | "sync" | "ai";

function Toggle({
  value,
  onChange,
  label,
  help,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
  help?: string;
}) {
  return (
    <div className="bb-toggle-row">
      <label className="bb-label-help">
        {label}
        {help && <HelpIcon text={help} />}
      </label>
      <button className={`bb-switch ${value ? "on" : ""}`} onClick={() => onChange(!value)} aria-pressed={value} />
    </div>
  );
}

export function SettingsDrawer(props: Props) {
  const { appConfig, board, git } = props;
  const [tab, setTab] = useState<Tab>("general");
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");

  const save = (key: string, value: unknown) => props.onSave({ [key]: value });
  const p = appConfig.policy;
  const a = appConfig.appearance;
  const ssh = appConfig.ssh;
  const activeServer = appConfig.activeStorageKind === "server";
  const conn = props.connectionStatus;

  return (
    <div className="bb-drawer-overlay" onMouseDown={props.onClose}>
      <aside className="bb-drawer" onMouseDown={(e) => e.stopPropagation()}>
        <div className="bb-drawer-head">
          <span className="bb-drawer-title" style={{ cursor: "default" }}>
            {t("settings.title")}
          </span>
          <button className="bb-iconbtn" onClick={props.onClose} title={t("settings.close")}>
            ✕
          </button>
        </div>

        <div className="bb-settings-tabs">
          {(["general", "git", "users", "appearance", "sync", "ai"] as Tab[]).map((key) => (
            <button
              key={key}
              className={`bb-tab ${tab === key ? "active" : ""}`}
              onClick={() => setTab(key)}
            >
              {t(`settings.${key}`)}
            </button>
          ))}
        </div>

        <div className="bb-drawer-body">
          {tab === "general" && (
            <>
              <div className="bb-field">
                <label>{t("settings.boardTitle")}</label>
                <input
                  className="bb-input"
                  defaultValue={appConfig.boardTitle}
                  onBlur={(e) => save("boardTitle", e.target.value)}
                />
              </div>
              <div className="bb-field">
                <label>{t("settings.projectName")}</label>
                <input
                  className="bb-input"
                  defaultValue={appConfig.projectName}
                  onBlur={(e) => save("projectName", e.target.value)}
                />
              </div>
              <div className="bb-field">
                <label className="bb-label-help">
                  {t("settings.language")}
                  <HelpIcon text={t("tooltips.settings.language")} />
                </label>
                <select
                  className="bb-input"
                  value={appConfig.language}
                  onChange={(e) => save("language", e.target.value)}
                >
                  <option value="pl">{t("settings.polish")}</option>
                  <option value="en">{t("settings.english")}</option>
                </select>
              </div>
              <div className="bb-field">
                <label className="bb-label-help">
                  {t("settings.storageMode")}
                  <HelpIcon text={t("tooltips.settings.storageMode")} />
                </label>
                <select
                  className="bb-input"
                  value={appConfig.storageMode}
                  onChange={(e) => save("storageMode", e.target.value)}
                >
                  <option value="workspace-json">{t("settings.storageLocal")}</option>
                  <option value="server">{t("settings.storageServer")}</option>
                </select>
              </div>
              <div className="bb-field">
                <label>{t("settings.localDataFile")}</label>
                <input
                  className="bb-input bb-mono"
                  defaultValue={p.localDataFile}
                  onBlur={(e) => save("localDataFile", e.target.value)}
                />
              </div>
            </>
          )}

          {tab === "git" && (
            <>
              <div className="bb-field-row">
                <div className="bb-field">
                  <label>{t("settings.mainBranch")}</label>
                  <input
                    className="bb-input bb-mono"
                    defaultValue={p.defaultMainBranch}
                    onBlur={(e) => save("defaultMainBranch", e.target.value)}
                  />
                </div>
                <div className="bb-field">
                  <label>{t("settings.remoteName")}</label>
                  <input
                    className="bb-input bb-mono"
                    defaultValue={p.remoteName}
                    onBlur={(e) => save("remoteName", e.target.value)}
                  />
                </div>
              </div>
              <div className="bb-field">
                <label className="bb-label-help">
                  {t("settings.runCommandBeforeFinish")}
                  <HelpIcon text={t("tooltips.settings.runCommandBeforeFinish")} />
                </label>
                <input
                  className="bb-input bb-mono"
                  defaultValue={p.runCommandBeforeFinish}
                  placeholder="npm run build"
                  onBlur={(e) => save("runCommandBeforeFinish", e.target.value)}
                />
              </div>
              <Toggle
                label={t("settings.requireCleanTree")}
                help={t("tooltips.settings.requireCleanWorkingTreeBeforeFinish")}
                value={p.requireCleanWorkingTreeBeforeFinish}
                onChange={(v) => save("requireCleanWorkingTreeBeforeFinish", v)}
              />
              <Toggle
                label={t("settings.allowDirectMerge")}
                help={t("tooltips.settings.allowDirectMergeToMain")}
                value={p.allowDirectMergeToMain}
                onChange={(v) => save("allowDirectMergeToMain", v)}
              />
              <Toggle
                label={t("settings.requireConfirmation")}
                value={p.requireConfirmationBeforeMerge}
                onChange={(v) => save("requireConfirmationBeforeMerge", v)}
              />
              <Toggle
                label={t("settings.deleteLocalBranch")}
                help={t("tooltips.settings.deleteLocalBranchAfterMerge")}
                value={p.deleteLocalBranchAfterMerge}
                onChange={(v) => save("deleteLocalBranchAfterMerge", v)}
              />
              <Toggle
                label={t("settings.deleteRemoteBranch")}
                help={t("tooltips.settings.deleteRemoteBranchAfterMerge")}
                value={p.deleteRemoteBranchAfterMerge}
                onChange={(v) => save("deleteRemoteBranchAfterMerge", v)}
              />
              <Toggle
                label={t("settings.finishOnMoveToDone")}
                help={t("tooltips.settings.finishOnMoveToDone")}
                value={p.finishOnMoveToDone}
                onChange={(v) => save("finishOnMoveToDone", v)}
              />
            </>
          )}

          {tab === "users" && (
            <>
              <div className="bb-field">
                <label>{t("settings.currentUser")}</label>
                <div className="bb-callout info">
                  {git?.userName ?? t("git.noUser")}
                  {git?.userEmail ? ` · ${git.userEmail}` : ""}
                </div>
              </div>
              <div className="bb-section">
                <div className="bb-section-title">{t("settings.importedUsers")}</div>
                {board.users.map((u) => (
                  <div key={u.id} className="bb-user-row">
                    <span className="bb-avatar" style={{ background: u.color }}>
                      {u.avatarText}
                    </span>
                    <div className="meta">
                      {u.name}
                      {u.id === props.currentUserId ? ` (${t("topBar.you")})` : ""}
                      <small>{u.email || "—"}</small>
                    </div>
                    <button
                      className="bb-iconbtn"
                      title={t("settings.deleteUser")}
                      onClick={() => props.onDeleteUser(u.id)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <div className="bb-section">
                <div className="bb-section-title">{t("settings.addUser")}</div>
                <div className="bb-field-row">
                  <input
                    className="bb-input"
                    placeholder={t("settings.userName")}
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                  />
                  <input
                    className="bb-input"
                    placeholder={t("settings.userEmail")}
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                  />
                </div>
                <div className="bb-field-row">
                  <button
                    className="bb-btn"
                    disabled={!newUserName.trim()}
                    onClick={() => {
                      props.onAddUser(newUserName.trim(), newUserEmail.trim());
                      setNewUserName("");
                      setNewUserEmail("");
                    }}
                  >
                    {t("settings.addUser")}
                  </button>
                  <button className="bb-btn ghost" onClick={props.onSyncUsers}>
                    {t("topBar.importUsers")}
                  </button>
                </div>
              </div>
            </>
          )}

          {tab === "appearance" && (
            <>
              <Toggle label={t("settings.compactMode")} value={a.compactMode} onChange={(v) => save("appearance.compactMode", v)} />
              <Toggle label={t("settings.showBranchBadges")} value={a.showBranchBadges} onChange={(v) => save("appearance.showBranchBadges", v)} />
              <Toggle label={t("settings.showComments")} value={a.showComments} onChange={(v) => save("appearance.showComments", v)} />
              <Toggle label={t("settings.showChecklist")} value={a.showChecklist} onChange={(v) => save("appearance.showChecklist", v)} />
              <Toggle label={t("settings.showAvatars")} value={a.showAvatars} onChange={(v) => save("appearance.showAvatars", v)} />
              <Toggle label={t("settings.showPriority")} value={a.showPriority} onChange={(v) => save("appearance.showPriority", v)} />
              <Toggle label={t("settings.reduceAnimations")} value={a.reduceAnimations} onChange={(v) => save("appearance.reduceAnimations", v)} />
            </>
          )}

          {tab === "sync" && (
            <>
              <div className="bb-field">
                <label>{t("settings.syncInterval")}</label>
                <input
                  className="bb-input"
                  type="number"
                  min={5}
                  defaultValue={p.syncIntervalSeconds}
                  onBlur={(e) => save("syncIntervalSeconds", Number(e.target.value) || 20)}
                />
              </div>
              <button className="bb-btn" onClick={props.onSyncNow}>
                {t("settings.syncNow")}
              </button>

              <div className="bb-section">
                <div className="bb-section-title">{t("settings.sshSection")}</div>
                <span className="bb-muted small">{t("settings.sshHint")}</span>

                <div className={`bb-conn-status ${activeServer ? "ok" : appConfig.storageMode === "server" ? "warn" : "neutral"}`}>
                  <span className="bb-conn-dot" />
                  <span>
                    {appConfig.storageMode === "server"
                      ? activeServer
                        ? t("settings.connActiveServer")
                        : t("settings.connFallback")
                      : t("settings.connLocal")}
                  </span>
                </div>

                <div className="bb-field-row">
                  <button className="bb-btn" disabled={props.connectionTesting} onClick={props.onTestConnection}>
                    {props.connectionTesting ? t("settings.connTesting") : t("settings.connTest")}
                  </button>
                  <button className="bb-btn ghost" onClick={props.onShowLogs}>
                    {t("settings.showLogs")}
                  </button>
                </div>

                {conn && (
                  <div className={`bb-conn-result ${conn.ok ? "ok" : "fail"}`}>
                    {conn.message === "notServerMode" ? (
                      <div className="bb-muted small">{t("settings.connNotServer")}</div>
                    ) : (
                      <>
                        <div className="bb-conn-result-head">
                          {conn.ok ? t("settings.connPass") : t("settings.connFail")} · {conn.target}
                        </div>
                        <ul className="bb-conn-steps">
                          {conn.steps.map((s, i) => (
                            <li key={i} className={s.ok ? "ok" : "fail"}>
                              <span className="bb-conn-step-icon">{s.ok ? "✓" : "✕"}</span>
                              <span className="bb-conn-step-name">{s.name}</span>
                              <code className="bb-conn-step-detail">{s.detail}</code>
                            </li>
                          ))}
                        </ul>
                        <button className="bb-btn ghost sm" onClick={props.onShowLogs}>
                          {t("settings.showLogs")}
                        </button>
                      </>
                    )}
                  </div>
                )}

                <div className="bb-field">
                  <label className="bb-label-help">
                  {t("settings.storageMode")}
                  <HelpIcon text={t("tooltips.settings.storageMode")} />
                </label>
                  <select
                    className="bb-input"
                    value={appConfig.storageMode}
                    onChange={(e) => save("storageMode", e.target.value)}
                  >
                    <option value="workspace-json">{t("settings.storageLocal")}</option>
                    <option value="server">{t("settings.storageServer")}</option>
                  </select>
                </div>

                <div className="bb-field">
                  <label>{t("settings.sshKey")}</label>
                  <div className="bb-field-row">
                    <input
                      className="bb-input bb-mono"
                      readOnly
                      value={ssh.sshKeyPath || t("settings.sshKeyUnset")}
                      title={ssh.sshKeyPath || t("settings.sshKeyUnset")}
                    />
                    <button className="bb-btn" onClick={props.onSelectSshKey}>
                      {t("settings.selectSshKey")}
                    </button>
                  </div>
                </div>

                <div className="bb-field">
                  <label>{t("settings.sshHost")}</label>
                  <input
                    className="bb-input bb-mono"
                    defaultValue={ssh.sshHost}
                    placeholder="user@host"
                    onBlur={(e) => save("sshHost", e.target.value.trim())}
                  />
                  <span className="bb-muted small">{t("settings.sshHostHint")}</span>
                </div>

                <div className="bb-field-row">
                  <div className="bb-field">
                    <label>{t("settings.sshPort")}</label>
                    <input
                      className="bb-input"
                      type="number"
                      min={1}
                      defaultValue={ssh.sshPort}
                      onBlur={(e) => save("sshPort", Number(e.target.value) || 22)}
                    />
                  </div>
                  <div className="bb-field">
                    <label>{t("settings.sqliteRemotePath")}</label>
                    <input
                      className="bb-input bb-mono"
                      defaultValue={ssh.sqliteRemotePath}
                      placeholder="~/sqlite/branchboard.db"
                      onBlur={(e) => save("sqliteRemotePath", e.target.value.trim())}
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {tab === "ai" && (
            <div className="bb-field">
              <label>{t("settings.aiTemplate")}</label>
              <textarea
                className="bb-input bb-mono"
                rows={14}
                defaultValue={appConfig.aiPromptTemplate}
                placeholder={t("settings.aiTemplateHint")}
                onBlur={(e) => save("aiPromptTemplate", e.target.value)}
              />
              <span className="bb-muted small">{t("settings.aiTemplateHint")}</span>
            </div>
          )}
        </div>

        <div className="bb-drawer-foot">
          <span className="bb-muted small">{t("app.tagline")}</span>
          <button className="bb-btn" onClick={props.onClose}>
            {t("settings.close")}
          </button>
        </div>
      </aside>
    </div>
  );
}
