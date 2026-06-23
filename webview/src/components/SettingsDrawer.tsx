import { useRef, useState } from "react";
import {
  AIAgentDefinition,
  AIAgentModelPricing,
  AIAgentModelsResultPayload,
  AppConfig,
  BoardData,
  BoardUser,
  BRANCH_BUTTON_BACKGROUNDS,
  ConnectionTestResult,
  GitInfo,
} from "../types";
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
  aiAgentModelsByAgent: Record<string, AIAgentModelsResultPayload>;
  onListAIAgentModels: (agentId: string) => void;
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

type Tab = "general" | "git" | "users" | "appearance" | "titleBar" | "notifications" | "sync" | "ai";

type TitleBarPresetKey = "default" | "dracula" | "oneDarkPro" | "nightOwl" | "monokai" | "solarizedDark";

/** Mirrors TitleBarService's PRESETS on the extension side — used only to
 * render preset swatches/preview here; the extension is the source of truth
 * for what actually gets applied. */
const TITLE_BAR_PRESET_COLORS: Record<TitleBarPresetKey, {
  backgroundColor: string;
  foregroundColor: string;
  borderColor: string;
  inactiveBackgroundColor: string;
  inactiveForegroundColor: string;
}> = {
  default: { backgroundColor: "#1f1f1f", foregroundColor: "#cccccc", borderColor: "#000000", inactiveBackgroundColor: "#181818", inactiveForegroundColor: "#6b6b6b" },
  dracula: { backgroundColor: "#282a36", foregroundColor: "#f8f8f2", borderColor: "#191a21", inactiveBackgroundColor: "#21222c", inactiveForegroundColor: "#6272a4" },
  oneDarkPro: { backgroundColor: "#282c34", foregroundColor: "#abb2bf", borderColor: "#181a1f", inactiveBackgroundColor: "#21252b", inactiveForegroundColor: "#5c6370" },
  nightOwl: { backgroundColor: "#011627", foregroundColor: "#d6deeb", borderColor: "#01101d", inactiveBackgroundColor: "#010e1a", inactiveForegroundColor: "#4b6479" },
  monokai: { backgroundColor: "#272822", foregroundColor: "#f8f8f2", borderColor: "#1e1f1a", inactiveBackgroundColor: "#1e1f1a", inactiveForegroundColor: "#75715e" },
  solarizedDark: { backgroundColor: "#073642", foregroundColor: "#eee8d5", borderColor: "#04282f", inactiveBackgroundColor: "#04282f", inactiveForegroundColor: "#657b83" },
};

const TITLE_BAR_PRESET_LABEL_KEYS: Record<TitleBarPresetKey, string> = {
  default: "settings.titleBarPresetDefault",
  dracula: "settings.titleBarPresetDracula",
  oneDarkPro: "settings.titleBarPresetOneDarkPro",
  nightOwl: "settings.titleBarPresetNightOwl",
  monokai: "settings.titleBarPresetMonokai",
  solarizedDark: "settings.titleBarPresetSolarizedDark",
};

/** Mirrors the `statusBarItem.*Background` theme colors used by
 *  BranchStatusBarService, for an approximate live preview only — the real
 *  color comes from the user's active theme. */
const BRANCH_BUTTON_PREVIEW_BG: Record<(typeof BRANCH_BUTTON_BACKGROUNDS)[number], string> = {
  none: "transparent",
  prominent: "#0e639c",
  warning: "#7a5c00",
  error: "#a1260d",
};

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

const TITLE_BAR_HEX_SWATCHES = [
  "#1f1f1f", "#282a36", "#282c34", "#011627", "#272822", "#073642",
  "#0d1117", "#1e1e1e", "#22272e", "#161b22",
];

function ColorField({
  label,
  value,
  onChange,
  help,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  help?: string;
}) {
  return (
    <div className="bb-field">
      <label className="bb-label-help">
        {label}
        {help && <HelpIcon text={help} />}
      </label>
      <div className="bb-color-swatches">
        {TITLE_BAR_HEX_SWATCHES.map((c) => (
          <button
            key={c}
            className={`bb-swatch ${value.toLowerCase() === c ? "active" : ""}`}
            style={{ background: c }}
            title={c}
            onClick={() => onChange(c)}
          />
        ))}
        <input
          type="color"
          className="bb-swatch bb-swatch-custom"
          value={/^#([0-9a-fA-F]{6})$/.test(value) ? value : "#1f1f1f"}
          onChange={(e) => onChange(e.target.value)}
          title={t("settings.customColor")}
        />
        <input
          className="bb-input bb-mono"
          style={{ width: 90 }}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}

function hasPricingRate(pricing: AIAgentModelPricing["pricing"] | undefined): boolean {
  return !!pricing && !!(pricing.inputPerMTok || pricing.outputPerMTok || pricing.cacheReadPerMTok || pricing.cacheWritePerMTok);
}

/**
 * Per-agent panel: lets the user refresh the model list from the agent's CLI
 * (when `listModelsArgs` is configured), see which known models have no
 * price entered yet, and edit each model's pricing/active flag in place.
 * Saves always write the *entire* `aiAgents` array back via onSaveAgents —
 * BranchBoard's "saveSettings" channel replaces the whole setting value, so
 * a partial patch here would silently drop every other agent.
 */
function AIAgentModelsEditor({
  agent,
  fetchResult,
  onListModels,
  onSaveAgents,
  allAgents,
}: {
  agent: AIAgentDefinition;
  fetchResult: AIAgentModelsResultPayload | undefined;
  onListModels: () => void;
  onSaveAgents: (next: AIAgentDefinition[]) => void;
  allAgents: AIAgentDefinition[];
}) {
  const knownModels = Array.from(
    new Set([...(agent.models ?? []), ...(fetchResult?.models ?? []), ...((agent.modelPricing ?? []).map((m) => m.modelId))])
  );

  const updateModel = (modelId: string, patch: Partial<AIAgentModelPricing>) => {
    const existing = agent.modelPricing ?? [];
    const idx = existing.findIndex((m) => m.modelId === modelId);
    const current: AIAgentModelPricing = idx >= 0 ? existing[idx] : { modelId, active: true };
    const updatedEntry: AIAgentModelPricing = {
      ...current,
      ...patch,
      pricing: { ...current.pricing, ...patch.pricing },
    };
    const nextModelPricing = idx >= 0 ? existing.map((m, i) => (i === idx ? updatedEntry : m)) : [...existing, updatedEntry];
    const nextAgents = allAgents.map((a) => (a.id === agent.id ? { ...a, modelPricing: nextModelPricing } : a));
    onSaveAgents(nextAgents);
  };

  const setAllModelsActive = (active: boolean) => {
    const existing = agent.modelPricing ?? [];
    const nextModelPricing = knownModels.map((modelId) => {
      const current = existing.find((m) => m.modelId === modelId);
      return current ? { ...current, active } : { modelId, active };
    });
    const nextAgents = allAgents.map((a) => (a.id === agent.id ? { ...a, modelPricing: nextModelPricing } : a));
    onSaveAgents(nextAgents);
  };

  const numberField = (modelId: string, key: keyof NonNullable<AIAgentModelPricing["pricing"]>, override: AIAgentModelPricing | undefined) => (
    <td>
      <label className="bb-ai-price-field">
        <input
          className="bb-input bb-mono"
          type="number"
          min={0}
          step="0.01"
          placeholder="—"
          defaultValue={override?.pricing?.[key] ?? ""}
          onBlur={(e) => {
            const raw = e.target.value.trim();
            const value = raw === "" ? undefined : Number(raw);
            updateModel(modelId, { pricing: { [key]: value && !Number.isNaN(value) ? value : undefined } as any });
          }}
        />
      </label>
    </td>
  );

  return (
    <div className="bb-ai-agent-models-card">
      <div className="bb-ai-agent-models-head">
        <div>
          <strong>{agent.name}</strong>
          <span className="bb-muted small"> — {agent.command}</span>
        </div>
        <button
          className="bb-btn bb-ai-agent-refresh-btn"
          onClick={onListModels}
          disabled={!agent.listModelsArgs || agent.listModelsArgs.length === 0}
          title={
            !agent.listModelsArgs || agent.listModelsArgs.length === 0
              ? t("settings.aiAgentsNoListCommand")
              : t("settings.aiAgentsRefreshModels")
          }
        >
          {t("settings.aiAgentsRefreshModels")}
        </button>
      </div>

      {fetchResult && !fetchResult.ok && (
        <div className="bb-ai-agent-models-error">
          {fetchResult.message}
          {fetchResult.detail && <div className="bb-muted small">{fetchResult.detail}</div>}
        </div>
      )}
      {fetchResult?.ok && (
        <div className="bb-muted small">{t("settings.aiAgentsModelsFetched", { count: String(fetchResult.models.length) })}</div>
      )}

      {knownModels.length === 0 ? (
        <div className="bb-muted small">{t("settings.aiAgentsNoModels")}</div>
      ) : (
        <>
          <div className="bb-ai-agent-models-bulk">
            <button className="bb-btn bb-btn-sm" onClick={() => setAllModelsActive(true)}>
              {t("settings.aiAgentsSelectAll")}
            </button>
            <button className="bb-btn bb-btn-sm" onClick={() => setAllModelsActive(false)}>
              {t("settings.aiAgentsDeselectAll")}
            </button>
          </div>
          <table className="bb-ai-agent-models-table">
          <thead>
            <tr>
              <th>{t("settings.aiAgentsModel")}</th>
              <th>{t("settings.aiAgentsActive")}</th>
              <th>{t("settings.aiAgentsInputPrice")}</th>
              <th>{t("settings.aiAgentsOutputPrice")}</th>
              <th>{t("settings.aiAgentsCacheReadPrice")}</th>
              <th>{t("settings.aiAgentsCacheWritePrice")}</th>
              <th>{t("settings.aiAgentsPriceStatus")}</th>
            </tr>
          </thead>
          <tbody>
            {knownModels.map((modelId) => {
              const override = (agent.modelPricing ?? []).find((m) => m.modelId === modelId);
              const effectivePricing = override?.pricing ?? agent.pricing;
              const missingPrice = !hasPricingRate(effectivePricing);
              const active = override?.active ?? true;
              return (
                <tr key={modelId}>
                  <td className="bb-mono">{modelId}</td>
                  <td>
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={(e) => updateModel(modelId, { active: e.target.checked })}
                    />
                  </td>
                  {numberField(modelId, "inputPerMTok", override)}
                  {numberField(modelId, "outputPerMTok", override)}
                  {numberField(modelId, "cacheReadPerMTok", override)}
                  {numberField(modelId, "cacheWritePerMTok", override)}
                  <td>
                    {missingPrice ? (
                      <span className="bb-badge tone-warning">{t("settings.aiAgentsPriceMissing")}</span>
                    ) : (
                      <span className="bb-badge tone-success">{t("settings.aiAgentsPriceSet")}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          </table>
        </>
      )}
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
  const tb = appConfig.titleBar;
  const nf = appConfig.notifications;
  const ssh = appConfig.ssh;
  const activeServer = appConfig.activeStorageKind === "server";
  const conn = props.connectionStatus;

  return (
    <div className="bb-settings-overlay" onMouseDown={props.onClose}>
      <div className="bb-settings-panel" onMouseDown={(e) => e.stopPropagation()}>
        <aside className="bb-settings-sidebar">
          <div className="bb-settings-brand">BranchBoard</div>
          <nav className="bb-settings-nav">
            {(["general", "git", "users", "appearance", "titleBar", "notifications", "sync", "ai"] as Tab[]).map((key) => (
              <button
                key={key}
                className={`bb-settings-navitem ${tab === key ? "active" : ""}`}
                onClick={() => setTab(key)}
              >
                {t(`settings.${key}`)}
              </button>
            ))}
          </nav>
        </aside>

        <div className="bb-settings-main">
          <div className="bb-drawer-head">
            <span className="bb-drawer-title" style={{ cursor: "default" }}>
              {t("settings.title")}
            </span>
            <button className="bb-iconbtn" onClick={props.onClose} title={t("settings.close")}>
              ✕
            </button>
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

          {tab === "titleBar" && (
            <>
              <Toggle
                label={t("settings.titleBarEnabled")}
                help={t("settings.titleBarEnabledHint")}
                value={tb.enabled}
                onChange={(v) => save("titleBar.enabled", v)}
              />

              {(() => {
                const presetColors =
                  tb.preset !== "custom" && tb.preset in TITLE_BAR_PRESET_COLORS
                    ? TITLE_BAR_PRESET_COLORS[tb.preset as TitleBarPresetKey]
                    : {
                        backgroundColor: tb.backgroundColor,
                        foregroundColor: tb.foregroundColor,
                        borderColor: tb.borderColor,
                        inactiveBackgroundColor: tb.inactiveBackgroundColor,
                        inactiveForegroundColor: tb.inactiveForegroundColor,
                      };
                return (
                  <div className="bb-section" style={{ opacity: tb.enabled ? 1 : 0.5 }}>
                    <div className="bb-section-title">{t("settings.titleBarPreview")}</div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        padding: "0 12px",
                        height: 30,
                        borderRadius: 6,
                        fontSize: 12,
                        fontFamily: "var(--vscode-font-family, sans-serif)",
                        background: presetColors.backgroundColor,
                        color: presetColors.foregroundColor,
                        borderBottom: `2px solid ${presetColors.borderColor}`,
                      }}
                    >
                      <span>{appConfig.projectName || appConfig.boardTitle}</span>
                      {tb.showBranch && (
                        <span style={{ color: presetColors.inactiveForegroundColor, marginLeft: 2 }}>
                          {tb.branchSeparator || "  ⎇ "}feature/login
                        </span>
                      )}
                    </div>
                  </div>
                );
              })()}

              <div className="bb-section">
                <div className="bb-section-title">{t("settings.titleBarPresetSection")}</div>
                <div className="bb-color-swatches" style={{ flexWrap: "wrap" }}>
                  <button
                    className={`bb-btn ghost sm ${tb.preset === "custom" ? "active" : ""}`}
                    onClick={() => {
                      save("titleBar.preset", "custom");
                      save("titleBar.enabled", true);
                    }}
                  >
                    {t("settings.titleBarPresetCustom")}
                  </button>
                  {(Object.keys(TITLE_BAR_PRESET_COLORS) as TitleBarPresetKey[]).map((key) => (
                    <button
                      key={key}
                      className={`bb-btn ghost sm ${tb.preset === key ? "active" : ""}`}
                      style={{
                        borderLeft: `4px solid ${TITLE_BAR_PRESET_COLORS[key].backgroundColor}`,
                      }}
                      onClick={() => {
                        save("titleBar.preset", key);
                        save("titleBar.enabled", true);
                      }}
                    >
                      {t(TITLE_BAR_PRESET_LABEL_KEYS[key])}
                    </button>
                  ))}
                </div>
              </div>

              {tb.preset === "custom" && (
                <div className="bb-section">
                  <div className="bb-section-title">{t("settings.titleBarColorsSection")}</div>
                  <ColorField
                    label={t("settings.titleBarBackground")}
                    value={tb.backgroundColor}
                    onChange={(v) => save("titleBar.backgroundColor", v)}
                  />
                  <ColorField
                    label={t("settings.titleBarForeground")}
                    value={tb.foregroundColor}
                    onChange={(v) => save("titleBar.foregroundColor", v)}
                  />
                  <ColorField
                    label={t("settings.titleBarBorder")}
                    value={tb.borderColor}
                    onChange={(v) => save("titleBar.borderColor", v)}
                  />
                  <ColorField
                    label={t("settings.titleBarInactiveBackground")}
                    value={tb.inactiveBackgroundColor}
                    onChange={(v) => save("titleBar.inactiveBackgroundColor", v)}
                  />
                  <ColorField
                    label={t("settings.titleBarInactiveForeground")}
                    value={tb.inactiveForegroundColor}
                    onChange={(v) => save("titleBar.inactiveForegroundColor", v)}
                  />
                </div>
              )}

              <div className="bb-section">
                <div className="bb-section-title">{t("settings.titleBarBranchSection")}</div>
                <Toggle
                  label={t("settings.titleBarShowBranch")}
                  help={t("settings.titleBarShowBranchHint")}
                  value={tb.showBranch}
                  onChange={(v) => save("titleBar.showBranch", v)}
                />
                {tb.showBranch && (
                  <div className="bb-field">
                    <label>{t("settings.titleBarBranchSeparator")}</label>
                    <input
                      className="bb-input bb-mono"
                      style={{ width: 120 }}
                      defaultValue={tb.branchSeparator}
                      onBlur={(e) => save("titleBar.branchSeparator", e.target.value)}
                    />
                  </div>
                )}
              </div>

              <div className="bb-section">
                <div className="bb-section-title">{t("settings.branchButtonSection")}</div>
                <p style={{ fontSize: 12, color: "var(--bb-muted)", margin: "0 0 8px" }}>
                  {t("settings.branchButtonHint")}
                </p>
                <Toggle
                  label={t("settings.branchButtonEnabled")}
                  value={tb.branchButtonEnabled}
                  onChange={(v) => save("titleBar.branchButtonEnabled", v)}
                />
                {tb.branchButtonEnabled && (
                  <>
                    <div style={{ display: "flex", justifyContent: "flex-end", padding: "4px 0 8px" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          padding: "2px 8px",
                          borderRadius: 4,
                          fontSize: 12,
                          fontFamily: "var(--vscode-font-family, sans-serif)",
                          color: tb.branchButtonColor,
                          background: BRANCH_BUTTON_PREVIEW_BG[tb.branchButtonBackground],
                        }}
                      >
                        ⎇ feature/login
                      </span>
                    </div>
                    <ColorField
                      label={t("settings.branchButtonColor")}
                      value={tb.branchButtonColor}
                      onChange={(v) => save("titleBar.branchButtonColor", v)}
                    />
                    <div className="bb-field">
                      <label>{t("settings.branchButtonBackground")}</label>
                      <div className="bb-color-swatches" style={{ flexWrap: "wrap" }}>
                        {BRANCH_BUTTON_BACKGROUNDS.map((key) => (
                          <button
                            key={key}
                            type="button"
                            className={`bb-btn ghost sm ${tb.branchButtonBackground === key ? "active" : ""}`}
                            onClick={() => save("titleBar.branchButtonBackground", key)}
                          >
                            {t(`settings.branchButtonBg.${key}`)}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
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
            <>
              <div className="bb-field">
                <label className="bb-label-help">
                  {t("settings.aiAgentsModelsTitle")}
                  <HelpIcon text={t("tooltips.settings.aiAgentsModels")} />
                </label>
                <span className="bb-muted small">{t("settings.aiAgentsModelsHint")}</span>
                {(appConfig.aiAgents ?? []).length === 0 ? (
                  <span className="bb-muted small">{t("settings.aiAgentsNoAgents")}</span>
                ) : (
                  (appConfig.aiAgents ?? []).map((agent) => (
                    <AIAgentModelsEditor
                      key={agent.id}
                      agent={agent}
                      fetchResult={props.aiAgentModelsByAgent[agent.id]}
                      onListModels={() => props.onListAIAgentModels(agent.id)}
                      allAgents={appConfig.aiAgents ?? []}
                      onSaveAgents={(next) => props.onSave({ aiAgents: next })}
                    />
                  ))
                )}
              </div>
            </>
          )}
          </div>

          <div className="bb-drawer-foot">
            <span className="bb-muted small">{t("app.tagline")}</span>
            <button className="bb-btn" onClick={props.onClose}>
              {t("settings.close")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
