import { useRef, useState } from "react";
import { AppConfig, BoardData, BoardUser, ConnectionTestResult, GitInfo } from "../types";
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
  onUpdateUser: (userId: string, patch: Partial<BoardUser>) => void;
  onSyncUsers: () => void;
  onSyncNow: () => void;
  onSelectSshKey: () => void;
  onTestConnection: () => void;
  onShowLogs: () => void;
}

const AVATAR_PALETTE = [
  "#38bdf8", "#f472b6", "#34d399", "#fbbf24",
  "#a78bfa", "#fb7185", "#60a5fa", "#f59e0b",
  "#4ade80", "#e879f9", "#22d3ee", "#facc15",
];

const MAX_PHOTO_BYTES = 350 * 1024; // keep board.json reasonably sized

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function ProfileEditor({
  user,
  onUpdate,
}: {
  user: BoardUser;
  onUpdate: (patch: Partial<BoardUser>) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const pickPhoto = async (file: File | undefined) => {
    if (!file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      setPhotoError(t("settings.profilePhotoInvalid"));
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError(t("settings.profilePhotoTooLarge"));
      return;
    }
    setPhotoError(null);
    const dataUrl = await readFileAsDataUrl(file);
    onUpdate({ avatarPhoto: dataUrl });
  };

  return (
    <div className="bb-section bb-profile-editor">
      <div className="bb-section-title">{t("settings.myProfile")}</div>
      <div className="bb-profile-row">
        <span
          className={`bb-avatar bb-avatar-lg ${user.avatarPhoto ? "has-photo" : ""}`}
          style={
            user.avatarPhoto
              ? { backgroundImage: `url(${user.avatarPhoto})` }
              : { background: user.color }
          }
        >
          {!user.avatarPhoto && user.avatarText}
        </span>
        <div className="bb-profile-photo-actions">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              void pickPhoto(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button className="bb-btn ghost" onClick={() => fileRef.current?.click()}>
            {t("settings.uploadPhoto")}
          </button>
          {user.avatarPhoto && (
            <button className="bb-btn ghost" onClick={() => onUpdate({ avatarPhoto: "" })}>
              {t("settings.removePhoto")}
            </button>
          )}
          {photoError && <div className="bb-field-error">{photoError}</div>}
        </div>
      </div>

      <div className="bb-field-row">
        <div className="bb-field">
          <label>{t("settings.userName")}</label>
          <input
            className="bb-input"
            defaultValue={user.name}
            onBlur={(e) => {
              if (e.target.value.trim()) {
                onUpdate({ name: e.target.value });
              }
            }}
          />
        </div>
        <div className="bb-field">
          <label>{t("settings.userEmail")}</label>
          <input
            className="bb-input"
            defaultValue={user.email}
            onBlur={(e) => onUpdate({ email: e.target.value })}
          />
        </div>
      </div>

      <div className="bb-field">
        <label className="bb-label-help">
          {t("settings.initials")}
          <HelpIcon text={t("tooltips.settings.initials")} />
        </label>
        <input
          className="bb-input bb-mono"
          style={{ width: 70 }}
          maxLength={2}
          defaultValue={user.avatarText}
          onBlur={(e) => {
            if (e.target.value.trim()) {
              onUpdate({ avatarText: e.target.value.toUpperCase() });
            }
          }}
        />
      </div>

      <div className="bb-field">
        <label>{t("settings.avatarColor")}</label>
        <div className="bb-color-swatches">
          {AVATAR_PALETTE.map((c) => (
            <button
              key={c}
              className={`bb-swatch ${user.color === c ? "active" : ""}`}
              style={{ background: c }}
              title={c}
              onClick={() => onUpdate({ color: c })}
            />
          ))}
          <input
            type="color"
            className="bb-swatch bb-swatch-custom"
            value={user.color}
            onChange={(e) => onUpdate({ color: e.target.value })}
            title={t("settings.customColor")}
          />
        </div>
      </div>
    </div>
  );
}

type Tab = "general" | "git" | "users" | "appearance" | "notifications" | "sync" | "ai";

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

const SOUND_LABEL_KEYS: Record<string, string> = {
  "mail-alert": "settings.notifSoundMailAlert",
  bells: "settings.notifSoundBells",
  "double-beep": "settings.notifSoundDoubleBeep",
};

function SoundPicker({
  soundFiles,
  value,
  disabled,
  onChange,
}: {
  soundFiles: Record<string, string>;
  value: string;
  disabled: boolean;
  onChange: (id: string) => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const preview = (id: string) => {
    const src = soundFiles[id];
    if (!src) {
      return;
    }
    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(src);
    audioRef.current = audio;
    setPlayingId(id);
    audio.addEventListener("ended", () => setPlayingId((cur) => (cur === id ? null : cur)));
    void audio.play().catch(() => setPlayingId((cur) => (cur === id ? null : cur)));
  };

  return (
    <div className="bb-sound-picker">
      {Object.keys(SOUND_LABEL_KEYS).map((id) => (
        <div key={id} className={`bb-sound-option ${value === id ? "active" : ""}`}>
          <label className="bb-sound-radio">
            <input
              type="radio"
              name="notif-sound"
              checked={value === id}
              disabled={disabled}
              onChange={() => onChange(id)}
            />
            {t(SOUND_LABEL_KEYS[id])}
          </label>
          <button
            type="button"
            className="bb-iconbtn bb-sound-preview"
            title={t("settings.notifSoundPreview")}
            disabled={!soundFiles[id]}
            onClick={() => preview(id)}
          >
            {playingId === id ? "⏸" : "▶"}
          </button>
        </div>
      ))}
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
  const nf = appConfig.notifications;
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
          {(["general", "git", "users", "appearance", "notifications", "sync", "ai"] as Tab[]).map((key) => (
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

              {(() => {
                const me = board.users.find((u) => u.id === props.currentUserId);
                return me ? (
                  <ProfileEditor
                    user={me}
                    onUpdate={(patch) => props.onUpdateUser(me.id, patch)}
                  />
                ) : null;
              })()}

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

          {tab === "notifications" && (
            <>
              <Toggle
                label={t("settings.notifEnabled")}
                value={nf.enabled}
                onChange={(v) => save("notifications.enabled", v)}
              />
              <Toggle
                label={t("settings.notifShowToast")}
                help={t("tooltips.settings.notifShowToast")}
                value={nf.showToast}
                onChange={(v) => save("notifications.showToast", v)}
              />
              <div className="bb-section">
                <div className="bb-section-title">{t("settings.notifTypesSection")}</div>
                <Toggle
                  label={t("settings.notifTaskCreated")}
                  value={nf.notifyTaskCreated}
                  onChange={(v) => save("notifications.notifyTaskCreated", v)}
                />
                <Toggle
                  label={t("settings.notifCommentAdded")}
                  value={nf.notifyCommentAdded}
                  onChange={(v) => save("notifications.notifyCommentAdded", v)}
                />
                <Toggle
                  label={t("settings.notifAssigned")}
                  value={nf.notifyAssigned}
                  onChange={(v) => save("notifications.notifyAssigned", v)}
                />
                <Toggle
                  label={t("settings.notifBranchPushed")}
                  value={nf.notifyBranchPushed}
                  onChange={(v) => save("notifications.notifyBranchPushed", v)}
                />
                <Toggle
                  label={t("settings.notifMergeFinished")}
                  value={nf.notifyMergeFinished}
                  onChange={(v) => save("notifications.notifyMergeFinished", v)}
                />
                <Toggle
                  label={t("settings.notifMergeFailed")}
                  value={nf.notifyMergeFailed}
                  onChange={(v) => save("notifications.notifyMergeFailed", v)}
                />
                <Toggle
                  label={t("settings.notifTaskMovedToReview")}
                  value={nf.notifyTaskMovedToReview}
                  onChange={(v) => save("notifications.notifyTaskMovedToReview", v)}
                />
                <Toggle
                  label={t("settings.notifTaskDone")}
                  value={nf.notifyTaskDone}
                  onChange={(v) => save("notifications.notifyTaskDone", v)}
                />
              </div>
              <div className="bb-section">
                <div className="bb-section-title">{t("settings.notifSoundSection")}</div>
                <Toggle
                  label={t("settings.notifSoundEnabled")}
                  value={nf.soundEnabled}
                  onChange={(v) => save("notifications.soundEnabled", v)}
                />
                <SoundPicker
                  soundFiles={appConfig.soundFiles}
                  value={nf.soundId}
                  disabled={!nf.soundEnabled}
                  onChange={(id) => save("notifications.soundId", id)}
                />
              </div>
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
