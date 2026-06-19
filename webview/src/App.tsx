import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AppConfig,
  BoardData,
  BoardAdminAnnouncement,
  BoardTask,
  BranchDetail,
  BranchMapGraph,
  CommitDetail,
  ConnectionTestResult,
  DashboardData,
  GitInfo,
  UserFilter,
} from "./types";
import { post, vscode } from "./vscode";
import { useToast } from "./toast";
import { setLanguage, t } from "./i18n";
import { TopBar } from "./components/TopBar";
import { Board } from "./components/Board";
import { QuickAddTaskModal } from "./components/QuickAddTaskModal";
import { buildAiPrompt } from "./utils";
import { richTextToPlainText } from "./richText";
import { guardTaskMove } from "./productionGuards";

type Page = "board" | "today" | "currentBranch" | "command" | "branchMap";

/** Filter state persisted across webview reloads via the VS Code webview state API. */
interface PersistedFilterState {
  filter?: UserFilter;
  showInactive?: boolean;
  /** Multi-select user filter (badges row). Absent = not customized yet (defaults to the owner). */
  selectedUserIds?: string[];
}

const TaskDrawer = lazy(() => import("./components/TaskDrawer").then((module) => ({ default: module.TaskDrawer })));
const SettingsDrawer = lazy(() =>
  import("./components/SettingsDrawer").then((module) => ({ default: module.SettingsDrawer }))
);
const Onboarding = lazy(() => import("./components/Onboarding").then((module) => ({ default: module.Onboarding })));
const ColumnConfigModal = lazy(() =>
  import("./components/ColumnConfigModal").then((module) => ({ default: module.ColumnConfigModal }))
);
const CommandCenterPage = lazy(() =>
  import("./pages/CommandCenterPage").then((module) => ({ default: module.CommandCenterPage }))
);
const BranchMapPage = lazy(() => import("./pages/BranchMapPage").then((module) => ({ default: module.BranchMapPage })));
const CurrentBranchPage = lazy(() =>
  import("./pages/CurrentBranchPage").then((module) => ({ default: module.CurrentBranchPage }))
);
const TodayTasksPage = lazy(() => import("./pages/TodayTasksPage").then((module) => ({ default: module.TodayTasksPage })));

const DEFAULT_APP_CONFIG: AppConfig = {
  language: "pl",
  projectName: "BranchBoard",
  boardTitle: "BranchBoard",
  storageMode: "workspace-json",
  activeStorageKind: "workspace-json",
  aiPromptTemplate: "",
  ssh: {
    sshKeyPath: "",
    sshHost: "",
    sshPort: 22,
    sqliteRemotePath: "~/sqlite/branchboard.db",
  },
  appearance: {
    compactMode: false,
    showBranchBadges: true,
    showComments: true,
    showChecklist: true,
    showAvatars: true,
    showPriority: true,
    reduceAnimations: false,
  },
  notifications: {
    enabled: true,
    showToast: true,
    notifyTaskCreated: true,
    notifyCommentAdded: true,
    notifyAssigned: true,
    notifyBranchPushed: true,
    notifyMergeFinished: true,
    notifyMergeFailed: true,
    notifyTaskMovedToReview: true,
    notifyTaskDone: true,
    soundEnabled: true,
    soundId: "mail-alert",
  },
  adminAnnouncement: {
    enabled: false,
    id: "",
    title: "",
    message: "",
    linkUrl: "",
    linkLabel: "",
    severity: "info",
  },
  soundFiles: {},
  policy: {
    allowDirectMergeToMain: false,
    requireConfirmationBeforeMerge: true,
    requireCleanWorkingTreeBeforeFinish: true,
    runCommandBeforeFinish: "",
    defaultMainBranch: "main",
    remoteName: "origin",
    localDataFile: ".branchboard/board.json",
    syncIntervalSeconds: 20,
    deleteLocalBranchAfterMerge: false,
    deleteRemoteBranchAfterMerge: false,
    criticalPaths: [],
    impactAreas: [],
    updateBranchStrategy: "merge",
    finishOnMoveToDone: false,
    devDeployCommand: "",
    devDeployUrlTemplate: "",
    productionBranch: "main",
    productionDeployCommand: "",
    allowProductionDeploy: false,
    requireConfirmationBeforeProductionDeploy: true,
    createSafetyTagBeforeMerge: false,
    createBackupBranchBeforeMerge: true,
    enableColumnHooks: true,
    allowedCommands: ["npm", "pnpm", "yarn", "npx", "node", "git", "make"],
    hookTimeoutSeconds: 120,
    useDevBranch: true,
    defaultBranchPrefix: "feature/",
    devBranch: "dev",
    runGitActionsOnMove: true,
    confirmGitActionsOnMove: true,
  },
};

export function App() {
  // Loaded once on mount: filters the user picked last time, so the board
  // re-opens exactly how they left it instead of resetting to defaults.
  const persistedFiltersRef = useRef<PersistedFilterState>((vscode.getState() as PersistedFilterState) ?? {});
  const persistedFilters = persistedFiltersRef.current;
  // Tracks whether the user (or a previous session) has ever touched the
  // user-badges row. Until that happens we auto-select the current Git user
  // once it's known; afterwards we always respect whatever — including
  // none — the user picked.
  const userFilterCustomizedRef = useRef(Array.isArray(persistedFilters.selectedUserIds));

  const [board, setBoard] = useState<BoardData | null>(null);
  const [git, setGit] = useState<GitInfo | null>(null);
  const [appConfig, setAppConfig] = useState<AppConfig>(DEFAULT_APP_CONFIG);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [filter, setFilter] = useState<UserFilter>(persistedFilters.filter ?? "all");
  const [showInactive, setShowInactive] = useState(persistedFilters.showInactive ?? true);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(persistedFilters.selectedUserIds ?? []);
  const [search, setSearch] = useState("");
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [configColumnId, setConfigColumnId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [page, setPage] = useState<Page>("board");
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [branchDetail, setBranchDetail] = useState<BranchDetail | null>(null);
  const [branchDetailLoading, setBranchDetailLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionTestResult | null>(null);
  const [connectionTesting, setConnectionTesting] = useState(false);
  const [fileSuggestions, setFileSuggestions] = useState<string[]>([]);
  const [branchMapGraph, setBranchMapGraph] = useState<BranchMapGraph | null>(null);
  const [branchMapGraphLoading, setBranchMapGraphLoading] = useState(false);
  const [commitDetail, setCommitDetail] = useState<CommitDetail | null>(null);
  const [commitDetailLoading, setCommitDetailLoading] = useState(false);

  setLanguage(appConfig.language);
  const pushToast = useToast();

  // Receive messages from the extension host.
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (!msg || typeof msg !== "object") {
        return;
      }
      switch (msg.type) {
        case "boardData":
          setBoard(msg.payload as BoardData);
          break;
        case "gitInfo":
          setGit(msg.payload.git as GitInfo);
          setCurrentUserId(msg.payload.currentUserId ?? null);
          break;
        case "appConfig":
          setAppConfig(msg.payload as AppConfig);
          break;
        case "dashboardData":
          setDashboard(msg.payload as DashboardData);
          break;
        case "branchDetail":
          setBranchDetail(msg.payload as BranchDetail);
          setBranchDetailLoading(false);
          break;
        case "connectionStatus":
          setConnectionStatus(msg.payload as ConnectionTestResult);
          setConnectionTesting(false);
          break;
        case "fileList":
          setFileSuggestions((msg.payload?.files as string[]) ?? []);
          break;
        case "branchMapGraph":
          setBranchMapGraph(msg.payload as BranchMapGraph);
          setBranchMapGraphLoading(false);
          break;
        case "commitDetail":
          setCommitDetail(msg.payload as CommitDetail);
          setCommitDetailLoading(false);
          break;
        case "navigate": {
          if (["command", "board", "today", "currentBranch", "branchMap"].includes(msg.payload?.page)) {
            setPage(msg.payload.page);
          }
          // Deep-link from a native VS Code notification's "Open task"
          // action (see BoardPanel.focusTask): open the task drawer over
          // whichever page we just navigated to. setActiveTaskId is a stable
          // setter, so this stays correct even though this listener is only
          // attached once on mount — the drawer itself looks the task up
          // from the always-fresh `board` state via useMemo.
          const taskId = msg.payload?.taskId;
          if (typeof taskId === "string" && taskId) {
            setActiveTaskId(taskId);
            // Same as openTask(): clears the green "unread comments" badge
            // now that the user is actually looking at this task's chat.
            post("markTaskCommentsRead", { taskId });
          }
          break;
        }
        case "operationResult": {
          const r = msg.payload as { ok: boolean; message: string; detail?: string };
          pushToast(r.ok ? "success" : "error", r.message, r.detail);
          break;
        }
        case "toast": {
          const p = msg.payload as {
            kind: "success" | "error" | "warning" | "info";
            text: string;
            detail?: string;
          };
          pushToast(p.kind, p.text, p.detail);
          break;
        }
        case "notification":
          pushToast("info", msg.payload?.message ?? "");
          break;
        case "error":
          pushToast("error", msg.payload?.message ?? "Error");
          break;
        default:
          break;
      }
    };
    window.addEventListener("message", handler);
    post("ready");
    return () => window.removeEventListener("message", handler);
  }, [pushToast]);

  useEffect(() => {
    if (!settingsOpen) {
      return undefined;
    }
    post("getGitInfo");
    const timer = window.setInterval(() => post("getGitInfo"), 5000);
    return () => window.clearInterval(timer);
  }, [settingsOpen]);

  // First time we learn who the current Git user is, and the user-badges row
  // has never been customized (this session or a previous one), default the
  // filter to "just me" — matches the board's usual "what's on my plate" use.
  useEffect(() => {
    if (!userFilterCustomizedRef.current && currentUserId && selectedUserIds.length === 0) {
      setSelectedUserIds([currentUserId]);
    }
  }, [currentUserId, selectedUserIds.length]);

  // Persist every filter change so the board reopens exactly as it was left.
  useEffect(() => {
    vscode.setState({ filter, showInactive, selectedUserIds } satisfies PersistedFilterState);
  }, [filter, showInactive, selectedUserIds]);

  const toggleUserFilter = useCallback((userId: string) => {
    userFilterCustomizedRef.current = true;
    setSelectedUserIds((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  }, []);

  // Play a sound when a *new* unread notification arrives for the current user.
  // Skip the very first board load so we don't replay a sound for notifications
  // that were already unread before this webview session started.
  const lastUnreadIdsRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!board || !currentUserId) {
      return;
    }
    const unreadIds = new Set(
      board.notifications
        .filter((n) => n.recipientUserIds.includes(currentUserId) && !n.readBy.includes(currentUserId))
        .map((n) => n.id)
    );
    const previous = lastUnreadIdsRef.current;
    if (previous) {
      const hasNew = [...unreadIds].some((id) => !previous.has(id));
      if (hasNew && appConfig.notifications.soundEnabled) {
        const src = appConfig.soundFiles[appConfig.notifications.soundId];
        if (src) {
          const audio = new Audio(src);
          void audio.play().catch(() => undefined);
        }
      }
    }
    lastUnreadIdsRef.current = unreadIds;
  }, [board, currentUserId, appConfig.notifications.soundEnabled, appConfig.notifications.soundId, appConfig.soundFiles]);

  // Keyboard shortcuts: "/" focus search, "n" new task, "esc" close panels.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName);
      if (e.key === "Escape") {
        setActiveTaskId(null);
        setSettingsOpen(false);
        return;
      }
      if (typing) {
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        document.getElementById("bb-search-input")?.focus();
      } else if (e.key === "n" && board) {
        e.preventDefault();
        const colId = board.columns[0]?.id;
        const title = window.prompt(t("board.taskName"));
        if (title && colId) {
          post("createTask", { title, columnId: colId, assignedUserId: currentUserId });
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [board, currentUserId]);

  const activeTask: BoardTask | null = useMemo(() => {
    if (!board || !activeTaskId) {
      return null;
    }
    return board.tasks.find((task) => task.id === activeTaskId) ?? null;
  }, [board, activeTaskId]);

  const activeAnnouncement: BoardAdminAnnouncement | null = useMemo(() => {
    if (!board || !currentUserId) {
      return null;
    }
    return (board.announcements ?? [])
      .filter((announcement) => announcement.active && !announcement.readBy.includes(currentUserId))
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
  }, [board, currentUserId]);

  const renderAdminAnnouncement = () => {
    if (!activeAnnouncement) {
      return null;
    }
    const linkLabel = activeAnnouncement.linkLabel || "Otwórz link";
    return (
      <div className={`bb-admin-announcement ${activeAnnouncement.severity}`} role="alert">
        <div className="bb-admin-announcement-main">
          <div className="bb-admin-announcement-title">{activeAnnouncement.title}</div>
          <div className="bb-admin-announcement-message">{activeAnnouncement.message}</div>
        </div>
        <div className="bb-admin-announcement-actions">
          {activeAnnouncement.linkUrl && (
            <button
              className="bb-btn primary"
              onClick={() => post("openExternal", { url: activeAnnouncement.linkUrl })}
            >
              {linkLabel}
            </button>
          )}
          <button
            className="bb-btn ghost"
            onClick={() => post("markAnnouncementRead", { announcementId: activeAnnouncement.id })}
          >
            OK
          </button>
        </div>
      </div>
    );
  };

  const isReviewColumn = useCallback(
    (columnId: string): boolean => {
      const col = board?.columns.find((c) => c.id === columnId);
      if (!col) {
        return false;
      }
      return /review|do.?test|testing|do.?zatwierdz/i.test(col.name) || /review|testing/.test(col.id);
    },
    [board]
  );

  const isDoneColumn = useCallback(
    (columnId: string): boolean => {
      const col = board?.columns.find((c) => c.id === columnId);
      if (!col) {
        return false;
      }
      return (
        col.gitStage === "production" ||
        col.id === "done" ||
        /zrobione|gotowe|\bdone\b|ukończ|ukoncz|produkc/i.test(col.name)
      );
    },
    [board]
  );

  const isInactiveTask = useCallback(
    (task: BoardTask): boolean => task.status === "done" || !!task.finishedAt || isDoneColumn(task.columnId),
    [isDoneColumn]
  );

  const canMoveTask = useCallback(
    (taskId: string, toColumnId: string): boolean => {
      if (!board) {
        return false;
      }
      const task = board.tasks.find((candidate) => candidate.id === taskId);
      if (!task) {
        return false;
      }
      const guard = guardTaskMove(board, appConfig, task, toColumnId);
      return guard.ok;
    },
    [board, appConfig]
  );

  const showBlockedTaskMove = useCallback(
    (taskId: string, toColumnId: string) => {
      if (!board) {
        return;
      }
      const task = board.tasks.find((candidate) => candidate.id === taskId);
      if (!task) {
        return;
      }
      const guard = guardTaskMove(board, appConfig, task, toColumnId);
      if (guard.ok) {
        return;
      }
      pushToast("warning", t(`task.production.${guard.reason}`));
    },
    [board, appConfig, pushToast]
  );

  const matchesSearch = useCallback(
    (task: BoardTask): boolean => {
      const q = search.trim().toLowerCase();
      if (!q) {
        return true;
      }
      const assignee = board?.users.find((u) => u.id === task.assignedUserId)?.name ?? "";
      const haystack = [
        task.title,
        richTextToPlainText(task.description),
        task.branchName,
        assignee,
        ...task.comments.map((c) => c.text),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    },
    [search, board]
  );

  const matchesFilter = useCallback(
    (task: BoardTask): boolean => {
      switch (filter) {
        case "all":
          return true;
        case "me":
          return !!currentUserId && task.assignedUserId === currentUserId;
        case "unassigned":
          return !task.assignedUserId;
        case "has-branch":
          return !!task.branchName;
        case "no-branch":
          return !task.branchName;
        case "current-branch":
          return !!task.branchName && task.branchName === git?.currentBranch;
        case "needs-review":
          return isReviewColumn(task.columnId);
        case "done":
          return isInactiveTask(task);
        default:
          return true;
      }
    },
    [filter, currentUserId, git, isReviewColumn, isInactiveTask]
  );

  // Header user-badges row: an empty selection means "no restriction" (show
  // everyone); otherwise only tasks assigned to one of the selected users.
  const matchesSelectedUsers = useCallback(
    (task: BoardTask): boolean => {
      if (selectedUserIds.length === 0) {
        return true;
      }
      return !!task.assignedUserId && selectedUserIds.includes(task.assignedUserId);
    },
    [selectedUserIds]
  );

  const visibleTasks = useCallback(
    (columnId: string): BoardTask[] => {
      if (!board) {
        return [];
      }
      return board.tasks
        .filter(
          (task) =>
            task.columnId === columnId &&
            (showInactive || !isInactiveTask(task)) &&
            matchesFilter(task) &&
            matchesSelectedUsers(task) &&
            matchesSearch(task)
        )
        .sort((a, b) => a.position - b.position);
    },
    [board, showInactive, isInactiveTask, matchesFilter, matchesSelectedUsers, matchesSearch]
  );

  const inactiveTaskCount = useMemo(
    () => (board ? board.tasks.filter((task) => isInactiveTask(task)).length : 0),
    [board, isInactiveTask]
  );

  const appClass = [
    "bb-app",
    appConfig.appearance.compactMode ? "compact" : "",
    appConfig.appearance.reduceAnimations ? "no-anim" : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (!board) {
    return (
      <div className="bb-app">
        <div className="bb-loading">
          <div className="bb-spinner" />
          <span>{t("app.loading")}</span>
        </div>
      </div>
    );
  }

  const showOnboarding = board.tasks.length === 0 && !onboardingDismissed && !settingsOpen;
  const lazyFallback = (
    <div className="bb-loading" aria-live="polite">
      <div className="bb-spinner" />
      <span>{t("app.loading")}</span>
    </div>
  );

  const requestBranchDetail = (branchName: string) => {
    if (!branchName) {
      return;
    }
    setBranchDetailLoading(true);
    post("getBranchDetail", { branchName });
  };

  // Open a task drawer; also fetch its branch detail so the work-log /
  // commit times can render at the top of the drawer.
  const openTask = (taskId: string) => {
    setActiveTaskId(taskId);
    const tk = board.tasks.find((x) => x.id === taskId);
    if (tk?.branchName) {
      requestBranchDetail(tk.branchName);
    }
    // Clears the green "unread comments" indicator on the card now that the
    // user is looking at this task's chat.
    post("markTaskCommentsRead", { taskId });
  };

  // Opens the task drawer as an overlay over the CURRENT view — no page switch.
  const openTaskFromDashboard = (taskId: string) => {
    openTask(taskId);
  };

  const navigateTo = (view: Page) => {
    setPage(view);
    if (view !== "board" && view !== "today") {
      post("getDashboardData");
    }
  };

  const renderSettings = () => (
    <Suspense fallback={lazyFallback}>
      <SettingsDrawer
        board={board}
        git={git}
        appConfig={appConfig}
        currentUserId={currentUserId}
        onClose={() => setSettingsOpen(false)}
        onSave={(patch) => post("saveSettings", { patch })}
        onAddUser={(name, email) => post("addUser", { name, email })}
        onDeleteUser={(userId) => post("deleteUser", { userId })}
        onUpdateUser={(userId, patch) => post("updateUser", { userId, patch })}
        onSyncUsers={() => post("syncUsers")}
        onSyncNow={() => post("syncNow")}
        onSelectSshKey={() => post("selectSshKey")}
        connectionStatus={connectionStatus}
        connectionTesting={connectionTesting}
        onTestConnection={() => {
          setConnectionTesting(true);
          setConnectionStatus(null);
          post("testConnection");
        }}
        onShowLogs={() => post("showLogs")}
      />
    </Suspense>
  );

  const copyAiPromptForTask = (taskId: string) => {
    const tk = board.tasks.find((x) => x.id === taskId);
    if (!tk) {
      return;
    }
    const text = buildAiPrompt({
      task: tk,
      projectName: appConfig.projectName,
      testCommand: appConfig.policy.runCommandBeforeFinish,
      users: board.users,
      template: appConfig.aiPromptTemplate,
      language: appConfig.language,
    });
    post("copyToClipboard", { text, label: t("toast.aiPromptCopied") });
    pushToast("success", t("toast.aiPromptCopied"));
    post("logEvent", { type: "ai_prompt_copied", taskId, branchName: tk.branchName || null, payload: { title: tk.title } });
  };

  // Commits + changed files for the active task's branch, when the loaded
  // detail matches it.
  const detailMatches =
    !!activeTask && !!branchDetail && branchDetail.branchName === activeTask.branchName;
  const activeBranchCommits = detailMatches ? branchDetail!.commits : [];
  const activeBranchFiles = detailMatches ? branchDetail!.files : [];
  const activeBranchFilesLoading =
    !!activeTask && !!activeTask.branchName && branchDetailLoading && !detailMatches;

  // Task editor as a top-level overlay — rendered over ANY page so opening a
  // task never forces a switch to the board view.
  const renderTaskDrawer = () => {
    if (!activeTask) {
      return null;
    }
    return (
      <Suspense fallback={lazyFallback}>
        <TaskDrawer
          task={activeTask}
          board={board}
          git={git}
          appConfig={appConfig}
          currentUserId={currentUserId}
          events={board.events}
          branchCommits={activeBranchCommits}
          branchFiles={activeBranchFiles}
          branchFilesLoading={activeBranchFilesLoading}
          onClose={() => setActiveTaskId(null)}
          onSave={(patch) => post("updateTask", { id: activeTask.id, patch })}
          onDelete={() => {
            post("deleteTask", { id: activeTask.id, title: activeTask.title });
            setActiveTaskId(null);
          }}
          onAssign={(userId) => post("assignUser", { taskId: activeTask.id, userId })}
          onAddComment={(text) => post("addComment", { taskId: activeTask.id, authorId: currentUserId, text })}
          onCreateBranch={(branchName) => post("createBranch", { taskId: activeTask.id, branchName })}
          onCheckoutBranch={(branchName) => post("checkoutBranch", { branchName })}
          onPushBranch={(branchName) => post("pushBranch", { branchName })}
          onUpdateFromMain={(branchName) =>
            post("updateBranchFromMain", {
              strategy: appConfig.policy.updateBranchStrategy,
              branchName,
              taskId: activeTask.id,
            })
          }
          onFinishTask={() => post("finishTask", { taskId: activeTask.id })}
          onMergeToMain={() => post("mergeToMain", { taskId: activeTask.id })}
          onCopyClipboard={(text, label) => {
            post("copyToClipboard", { text, label });
            pushToast("success", label);
          }}
          onAiPromptCopied={() =>
            post("logEvent", {
              type: "ai_prompt_copied",
              taskId: activeTask.id,
              branchName: activeTask.branchName || null,
              payload: { title: activeTask.title },
            })
          }
          onDeployDev={() => post("deployDev", { taskId: activeTask.id })}
          onDeployProduction={() => post("deployProduction", { taskId: activeTask.id })}
          onMarkTested={() => post("markTested", { taskId: activeTask.id })}
          onCreateBackup={() => post("createBackupBranch", { branchName: activeTask.branchName })}
          onCreateSafetyTag={() => post("createSafetyTag", { taskId: activeTask.id })}
          onRevertLastCommit={() => post("revertLastCommit", { branchName: activeTask.branchName })}
          onRevertFromOrigin={() => post("revertFromOrigin", { branchName: activeTask.branchName })}
          onOpenExternal={(url) => post("openExternal", { url })}
          onOpenFile={(path) => post("openFile", { path })}
          onOpenDiff={(path) => post("openDiff", { branchName: activeTask.branchName, path })}
          fileSuggestions={fileSuggestions}
          onSearchFiles={(query) => post("searchFiles", { query })}
        />
      </Suspense>
    );
  };

  // Global "add task" floating button — rendered via a portal directly under
  // <body> so it stays visible above every page (board, today, command
  // center, branch map, current branch), independent of the current `page`
  // state and unaffected by any ancestor's overflow/scroll clipping.
  const renderQuickAddFab = () =>
    createPortal(
      <button
        type="button"
        className="bb-fab"
        onClick={() => setQuickAddOpen(true)}
        title={t("quickAdd.fabTitle")}
        aria-label={t("quickAdd.fabTitle")}
      >
        <span aria-hidden="true">+</span>
      </button>,
      document.body
    );

  // The quick-add modal itself only mounts while open. Saving always closes
  // it (QuickAddTaskModal already guards against an empty title); canceling
  // (X, backdrop, Escape, "Anuluj") closes it without ever calling onCreate.
  const renderQuickAddModal = () => {
    if (!quickAddOpen) {
      return null;
    }
    // New tasks may only land directly in the first two columns (BACKLOG /
    // DO ZROBIENIA) — everything past that is reached by moving the task
    // forward, not by adding straight into it.
    const quickAddColumns = [...board.columns].sort((a, b) => a.position - b.position).slice(0, 2);
    return createPortal(
      <QuickAddTaskModal
        columns={quickAddColumns}
        onCreate={(title, columnId) =>
          post("createTask", { title, columnId, assignedUserId: currentUserId })
        }
        onClose={() => setQuickAddOpen(false)}
      />,
      document.body
    );
  };

  if (page === "today") {
    return (
      <div className={appClass}>
        <Suspense fallback={lazyFallback}>
          <TodayTasksPage
            board={board}
            git={git}
            appConfig={appConfig}
            currentUserId={currentUserId}
            page="today"
            onNavigate={navigateTo}
            onOpenSettings={() => setSettingsOpen(true)}
            onRefresh={() => post("refresh")}
            onOpenTask={openTaskFromDashboard}
            onToggleDone={(task) =>
              post("updateTask", {
                id: task.id,
                patch: { status: task.status === "done" ? "open" : "done" },
              })
            }
          />
        </Suspense>
        {renderAdminAnnouncement()}
        {renderTaskDrawer()}
        {settingsOpen && renderSettings()}
        {renderQuickAddFab()}
        {renderQuickAddModal()}
      </div>
    );
  }

  if (page === "command") {
    return (
      <div className={appClass}>
        <Suspense fallback={lazyFallback}>
          <CommandCenterPage
            board={board}
            git={git}
            dashboard={dashboard}
            appConfig={appConfig}
            currentUserId={currentUserId}
            title={`${board.boardTitle || appConfig.boardTitle} · ${t("cc.titleSuffix")}`}
            page="command"
            onNavigate={navigateTo}
            onOpenSettings={() => setSettingsOpen(true)}
            onRefresh={() => post("getDashboardData")}
            onOpenInBrowser={() => pushToast("info", t("cc.openInBrowserSoon"))}
            onOpenTask={openTaskFromDashboard}
            onCopy={(text, label) => {
              post("copyToClipboard", { text, label });
              pushToast("success", label);
            }}
            onCheckout={(branchName) => post("checkoutBranch", { branchName })}
            branchDetail={branchDetail}
            branchDetailLoading={branchDetailLoading}
            onSelectBranch={requestBranchDetail}
            onOpenFile={(path) => post("openFile", { path })}
            onOpenDiff={(branchName, path) => post("openDiff", { branchName, path })}
            onOpenExternal={(url) => post("openExternal", { url })}
            onPush={(branchName) => post("pushBranch", { branchName })}
            onDeployDev={(taskId) => post("deployDev", { taskId })}
            onCreateTaskFromBranch={(branchName) =>
              post("createTask", {
                title: branchName.replace(/^feature\//, "").replace(/[-_]/g, " "),
                branchName,
                columnId:
                  board.columns.find((c) => /in.?progress|w.?tok/i.test(c.name))?.id ??
                  board.columns[0]?.id ??
                  "todo",
                assignedUserId: currentUserId,
              })
            }
            onCopyAiPrompt={copyAiPromptForTask}
            onDeleteLocal={(branchName) => post("deleteLocalBranch", { branchName })}
            onDeleteRemote={(branchName) => post("deleteRemoteBranch", { branchName })}
            onArchive={(branchName) => post("archiveBranch", { branchName })}
            onLinkBranch={(taskId, branchName) => post("updateTask", { id: taskId, patch: { branchName } })}
            onBulkDeleteLocal={(branches) => post("bulkDeleteLocalBranches", { branches })}
          />
        </Suspense>
        {renderAdminAnnouncement()}
        {renderTaskDrawer()}
        {settingsOpen && renderSettings()}
        {renderQuickAddFab()}
        {renderQuickAddModal()}
      </div>
    );
  }

  if (page === "branchMap") {
    return (
      <div className={appClass}>
        <Suspense fallback={lazyFallback}>
          <BranchMapPage
            board={board}
            dashboard={dashboard}
            appConfig={appConfig}
            git={git}
            currentUserId={currentUserId}
            page="branchMap"
            branchDetail={branchDetail}
            branchDetailLoading={branchDetailLoading}
            branchMapGraph={branchMapGraph}
            branchMapGraphLoading={branchMapGraphLoading}
            commitDetail={commitDetail}
            commitDetailLoading={commitDetailLoading}
            onNavigate={navigateTo}
            onOpenSettings={() => setSettingsOpen(true)}
            onRefresh={() => post("getDashboardData")}
            onRequestGraph={() => {
              setBranchMapGraphLoading(true);
              post("getBranchMapGraph");
            }}
            onRequestCommitDetail={(hash) => {
              setCommitDetailLoading(true);
              post("getCommitDetail", { hash });
            }}
            onOpenCommitDiff={(hash, path) => post("openCommitDiff", { hash, path })}
            onRequestBranchDetail={requestBranchDetail}
            onOpenTask={openTaskFromDashboard}
            onCheckout={(branchName) => post("checkoutBranch", { branchName })}
            onPush={(branchName) => post("pushBranch", { branchName })}
            onDeployDev={(taskId) => post("deployDev", { taskId })}
            onCreateTaskFromBranch={(branchName) =>
              post("createTask", {
                title: branchName.replace(/^feature\//, "").replace(/[-_]/g, " "),
                branchName,
                columnId:
                  board.columns.find((c) => /in.?progress|w.?tok/i.test(c.name))?.id ??
                  board.columns[0]?.id ??
                  "todo",
                assignedUserId: currentUserId,
              })
            }
            onCopyAiPrompt={copyAiPromptForTask}
            onOpenFile={(path) => post("openFile", { path })}
            onOpenDiff={(branchName, path) => post("openDiff", { branchName, path })}
            onDeleteLocal={(branchName) => post("deleteLocalBranch", { branchName })}
            onDeleteRemote={(branchName) => post("deleteRemoteBranch", { branchName })}
            onArchive={(branchName) => post("archiveBranch", { branchName })}
            onCopy={(text, label) => {
              post("copyToClipboard", { text, label });
              pushToast("success", label);
            }}
          />
        </Suspense>
        {renderAdminAnnouncement()}
        {renderTaskDrawer()}
        {settingsOpen && renderSettings()}
        {renderQuickAddFab()}
        {renderQuickAddModal()}
      </div>
    );
  }

  if (page === "currentBranch") {
    return (
      <div className={appClass}>
        <Suspense fallback={lazyFallback}>
          <CurrentBranchPage
            board={board}
            git={git}
            dashboard={dashboard}
            appConfig={appConfig}
            currentUserId={currentUserId}
            page="currentBranch"
            branchDetail={branchDetail}
            events={board.events}
            onSaveChecklist={(taskId, items) => post("updateTask", { id: taskId, patch: { checklist: items } })}
            onAddComment={(taskId, text) => post("addComment", { taskId, authorId: currentUserId, text })}
            onNavigate={navigateTo}
            onOpenSettings={() => setSettingsOpen(true)}
            onRefresh={() => post("getDashboardData")}
            onRequestBranchDetail={requestBranchDetail}
            onOpenTask={openTaskFromDashboard}
            onPush={(branchName) => post("pushBranch", { branchName })}
            onDeployDev={(taskId) => post("deployDev", { taskId })}
            onFinish={(taskId) => post("finishTask", { taskId })}
            onMoveTask={(taskId, columnId) => post("moveTask", { taskId, toColumnId: columnId, toIndex: 0 })}
            onCreateTask={(payload) => post("createTask", { ...payload, assignedUserId: currentUserId })}
            onLinkBranch={(taskId, branchName) => post("updateTask", { id: taskId, patch: { branchName } })}
            onCopy={(text, label) => {
              post("copyToClipboard", { text, label });
              pushToast("success", label);
            }}
            onCopyAiPrompt={copyAiPromptForTask}
            onOpenFile={(path) => post("openFile", { path })}
            onOpenDiff={(branchName, path) => post("openDiff", { branchName, path })}
            onCheckout={(branchName) => post("checkoutBranch", { branchName })}
            onUpdateFromMain={() => post("updateBranchFromMain", { strategy: appConfig.policy.updateBranchStrategy })}
          />
        </Suspense>
        {renderAdminAnnouncement()}
        {renderTaskDrawer()}
        {settingsOpen && renderSettings()}
        {renderQuickAddFab()}
        {renderQuickAddModal()}
      </div>
    );
  }

  return (
    <div className={appClass}>
      <TopBar
        board={board}
        git={git}
        appConfig={appConfig}
        currentUserId={currentUserId}
        filter={filter}
        search={search}
        showInactive={showInactive}
        inactiveTaskCount={inactiveTaskCount}
        selectedUserIds={selectedUserIds}
        onFilterChange={setFilter}
        onSearchChange={setSearch}
        onShowInactiveChange={setShowInactive}
        onToggleUserFilter={toggleUserFilter}
        onAddColumn={(name) => post("addColumn", { name })}
        onRefresh={() => post("refresh")}
        onSync={() => post("syncNow")}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenTask={openTask}
        page={page}
        onNavigate={navigateTo}
      />

      {renderAdminAnnouncement()}

      {showOnboarding ? (
        <Suspense fallback={lazyFallback}>
          <Onboarding
            git={git}
            onCreate={(addExamples) => {
              post("createBoard", { addExamples });
              setOnboardingDismissed(true);
            }}
            onSkip={() => setOnboardingDismissed(true)}
          />
        </Suspense>
      ) : (
        <Board
          board={board}
          appConfig={appConfig}
          git={git}
          currentUserId={currentUserId}
          getColumnTasks={visibleTasks}
          onOpenTask={openTask}
          onAddTask={(columnId, title) =>
            post("createTask", { title, columnId, assignedUserId: currentUserId })
          }
          onMoveTask={(taskId, toColumnId, toIndex) =>
            post("moveTask", { taskId, toColumnId, toIndex })
          }
          canMoveTask={canMoveTask}
          onBlockedTaskMove={showBlockedTaskMove}
          onRenameColumn={(id, name) => post("renameColumn", { id, name })}
          onDeleteColumn={(id) => post("deleteColumn", { id })}
          onConfigureColumn={(id) => setConfigColumnId(id)}
          onMoveColumn={(orderedIds) => post("moveColumn", { orderedIds })}
          onToggleDone={(task) =>
            post("updateTask", {
              id: task.id,
              patch: { status: task.status === "done" ? "open" : "done" },
            })
          }
        />
      )}

      {renderTaskDrawer()}

      {settingsOpen && renderSettings()}

      {configColumnId && board && (() => {
        const col = board.columns.find((c) => c.id === configColumnId);
        if (!col) {
          return null;
        }
        return (
          <Suspense fallback={lazyFallback}>
            <ColumnConfigModal
              column={col}
              allowedCommands={appConfig.policy.allowedCommands}
              policy={appConfig.policy}
              onClose={() => setConfigColumnId(null)}
              onSave={(id, patch) => post("saveColumnConfig", { id, patch })}
            />
          </Suspense>
        );
      })()}

      {renderQuickAddFab()}
      {renderQuickAddModal()}
    </div>
  );
}
