import { spawn, ChildProcess } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { t } from "../i18n";
import {
  AIAgentChangedFile,
  AIAgentCostEstimate,
  AIAgentDefinition,
  AIAgentPricing,
  AIAgentRunStatus,
  AIAgentUsage,
  BoardData,
  BoardTask,
  BranchBoardConfig,
  CursorSubAgentInfo,
  GitInfo,
  OperationResult,
} from "../types";
import { Logger } from "./Logger";

export type AIAgentRunKind = "plan" | "run" | "review";

export interface AIAgentPreview {
  agent: AIAgentDefinition;
  command: string;
  args: string[];
  promptFile: string;
  branchName: string;
}

export interface AIAgentProcessResult extends OperationResult {
  status: AIAgentRunStatus;
  stdout: string;
  stderr: string;
  promptFile: string;
  planFile?: string;
  durationMs: number;
  plan?: string;
  result?: string;
  reviewResult?: string;
  cancelled?: boolean;
  /** Token usage reported by the agent, if it emitted any (JSON/stream-json output). */
  usage?: AIAgentUsage;
}

/** One live chunk of agent output, streamed as it is produced by the child process. */
export type AIAgentOutputStream = "stdout" | "stderr" | "system";

export interface AIAgentRunHandlers {
  /** Called for every chunk of output as soon as it arrives — wire this to the webview to show a live console. */
  onChunk?: (stream: AIAgentOutputStream, text: string) => void;
  /**
   * Called synchronously right after the child process is spawned, with the
   * live process handle. Callers can store it and call `.kill()` later to
   * implement a "Stop" button — this is the only supported way to cancel a
   * run, since the run() promise only settles once the process exits.
   */
  onProcessStarted?: (proc: ChildProcess) => void;
}

/**
 * Normalizes token usage objects across the different naming conventions CLI
 * agents use (camelCase, snake_case Anthropic-API-style, etc.) into one
 * stable shape. Returns undefined if nothing recognizable was found, so
 * callers can tell "no usage reported" apart from "all-zero usage".
 */
function normalizeAIAgentUsage(raw: unknown): AIAgentUsage | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const obj = raw as Record<string, unknown>;
  const pick = (...keys: string[]): number | undefined => {
    for (const key of keys) {
      const value = obj[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }
    }
    return undefined;
  };
  const usage: AIAgentUsage = {
    inputTokens: pick("inputTokens", "input_tokens"),
    outputTokens: pick("outputTokens", "output_tokens"),
    cacheReadTokens: pick("cacheReadTokens", "cache_read_input_tokens", "cache_read_tokens"),
    cacheWriteTokens: pick("cacheWriteTokens", "cache_creation_input_tokens", "cache_write_tokens"),
  };
  const hasAny = Object.values(usage).some((value) => typeof value === "number");
  return hasAny ? usage : undefined;
}

/**
 * Resolves the pricing to use for a run: a per-model override from
 * `agent.modelPricing` (matched by modelId) takes priority over the
 * agent-level `agent.pricing`, since one agent entry can offer several
 * models (e.g. Sonnet/Opus/Haiku) at very different real-world prices.
 * Returns undefined if neither is configured — computeAIAgentCost then
 * stays undefined too, never guessing a number.
 */
export function resolveAIAgentModelPricing(
  agent: AIAgentDefinition | null | undefined,
  modelId: string | null | undefined
): AIAgentPricing | undefined {
  if (!agent) {
    return undefined;
  }
  const trimmedModel = (modelId || "").trim();
  if (trimmedModel && trimmedModel !== "auto") {
    const override = (agent.modelPricing || []).find((entry) => entry.modelId === trimmedModel);
    if (override?.pricing) {
      return override.pricing;
    }
  }
  return agent.pricing;
}

/**
 * Estimates the cost of a run from its token usage and an agent's optional,
 * user-configured pricing. Returns undefined when usage or pricing (or both)
 * are missing — BranchBoard never guesses a price, so the UI can tell "no
 * estimate available" apart from "$0.00".
 */
export function computeAIAgentCost(
  usage: AIAgentUsage | undefined,
  pricing: AIAgentPricing | undefined
): AIAgentCostEstimate | undefined {
  if (!usage || !pricing) {
    return undefined;
  }
  const hasRate = pricing.inputPerMTok || pricing.outputPerMTok || pricing.cacheReadPerMTok || pricing.cacheWritePerMTok;
  if (!hasRate) {
    return undefined;
  }
  const per = (tokens: number | undefined, ratePerMTok: number | undefined): number =>
    tokens && ratePerMTok ? (tokens / 1_000_000) * ratePerMTok : 0;
  const inputCost = per(usage.inputTokens, pricing.inputPerMTok);
  const outputCost = per(usage.outputTokens, pricing.outputPerMTok);
  const cacheReadCost = per(usage.cacheReadTokens, pricing.cacheReadPerMTok);
  const cacheWriteCost = per(usage.cacheWriteTokens, pricing.cacheWritePerMTok);
  return {
    currency: pricing.currency || "USD",
    inputCost,
    outputCost,
    cacheReadCost,
    cacheWriteCost,
    totalCost: inputCost + outputCost + cacheReadCost + cacheWriteCost,
  };
}

/** Reads `--output-format <value>` out of a CLI agent's argv, if present. */
function detectOutputFormat(args: string[]): "json" | "stream-json" | "text" | undefined {
  const idx = args.findIndex((arg) => arg === "--output-format" || arg === "-output-format");
  const value = idx >= 0 ? args[idx + 1] : undefined;
  if (value === "json" || value === "stream-json" || value === "text") {
    return value;
  }
  return undefined;
}

/**
 * Formats one parsed stream-json (NDJSON) event from an agent run into a
 * short, human-readable line for the live console. Falls back to a generic
 * label for event shapes we don't specifically recognize, so nothing is
 * silently swallowed — agents broadly agree on a Claude-Code-style event
 * shape ({type: "assistant" | "user" | "system" | "result", ...}) but exact
 * fields vary, so every lookup here is defensive.
 */
function formatStreamJsonEvent(obj: Record<string, unknown>): string | null {
  const type = obj.type;
  if (type === "assistant" || type === "user") {
    const message = obj.message as Record<string, unknown> | undefined;
    const content = message?.content;
    if (Array.isArray(content)) {
      const parts: string[] = [];
      for (const block of content) {
        if (!block || typeof block !== "object") continue;
        const b = block as Record<string, unknown>;
        if (b.type === "text" && typeof b.text === "string" && b.text.trim()) {
          parts.push(b.text.trim());
        } else if (b.type === "tool_use" && typeof b.name === "string") {
          parts.push(`🔧 ${b.name}`);
        } else if (b.type === "tool_result") {
          parts.push("↩︎ wynik narzędzia");
        }
      }
      return parts.length ? parts.join("\n") : null;
    }
    return null;
  }
  if (type === "system") {
    const subtype = typeof obj.subtype === "string" ? obj.subtype : "";
    return subtype ? `· system: ${subtype}` : null;
  }
  if (type === "result") {
    // The final result event is handled separately (parseOutput + the
    // formatted summary appended at process close), so don't echo it here.
    return null;
  }
  return null;
}

type AIAgentExecutableResolution =
  | { ok: true; executable: string }
  | { ok: false; message: string; detail?: string };

/**
 * Safe adapter for task-level AI coding agents (Cursor Agent, Claude CLI, etc.).
 * It never shells out, never pushes, never merges and never deploys. It only
 * runs a configured binary with a concrete argv array inside the workspace.
 */
export class AIAgentService {
  constructor(
    private readonly cwd: string,
    private readonly getConfig: () => BranchBoardConfig
  ) {}

  private static readonly SAFE_BINARY_NAME = /^[A-Za-z0-9_-]+$/;
  private static readonly UNSAFE_PATH_COMMAND = /[\s;&|<>$`(){}\[\]'"]/;
  private static readonly COMMON_EXECUTABLE_DIRS =
    process.platform === "darwin"
      ? [
          "/opt/homebrew/bin",
          "/usr/local/bin",
          "/usr/bin",
          "/bin",
          "/opt/local/bin",
          "/Applications/Cursor.app/Contents/Resources/app/bin",
        ]
      : process.platform === "linux"
        ? ["/usr/local/bin", "/usr/bin", "/bin", "/snap/bin"]
        : [];

  private static stripRichText(value: string): string {
    const text = (value || "").trim();
    if (!text) {
      return "";
    }
    try {
      const parsed = JSON.parse(text);
      const out: string[] = [];
      const visit = (node: any) => {
        if (!node || typeof node !== "object") {
          return;
        }
        if (typeof node.text === "string") {
          out.push(node.text);
        }
        if (Array.isArray(node.content)) {
          for (const child of node.content) {
            visit(child);
          }
        }
      };
      visit(parsed);
      const plain = out.join(" ").replace(/\s+/g, " ").trim();
      if (plain) {
        return plain;
      }
    } catch {
      /* plain markdown/html-ish text */
    }
    return text
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private static extractMentionedFiles(text: string): string[] {
    const files = new Set<string>();
    for (const match of text.matchAll(/(^|\s)@([A-Za-z0-9._/-]+)/g)) {
      const filePath = (match[2] ?? "").replace(/[),.;!?]+$/, "");
      if (filePath.includes("/") || /\.[A-Za-z0-9]{1,12}$/.test(filePath)) {
        files.add(filePath);
      }
    }
    return [...files];
  }

  private static slug(input: string): string {
    return (input || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/ł/g, "l")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 44)
      .replace(/-+$/g, "");
  }

  suggestBranchName(task: BoardTask): string {
    const cfg = this.getConfig();
    const prefix = (cfg.defaultAIBranchPrefix || "ai/").replace(/^\/+/, "");
    const safePrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;
    const shortId = (task.id.replace(/[^a-z0-9]/gi, "").slice(-8) || "task").toLowerCase();
    const slug = AIAgentService.slug(task.title) || "task";
    return `${safePrefix}task-${shortId}-${slug}`.slice(0, 96).replace(/-+$/g, "");
  }

  buildPrompt(board: BoardData, task: BoardTask, git: GitInfo | null, cursorAgents: CursorSubAgentInfo[] = []): string {
    const cfg = this.getConfig();
    const userName = (userId: string | null | undefined) =>
      userId ? board.users.find((u) => u.id === userId)?.name ?? userId : "";
    const column = board.columns.find((c) => c.id === task.columnId);
    const description = AIAgentService.stripRichText(task.description);
    const comments = (task.comments ?? []).map((comment) => {
      return `${userName(comment.authorId)} (${comment.createdAt}): ${comment.text}`;
    });
    const checklist = (task.checklist ?? []).map((item) => `${item.done ? "[x]" : "[ ]"} ${item.text}`);
    const mentionedFiles = [
      ...AIAgentService.extractMentionedFiles(task.title),
      ...AIAgentService.extractMentionedFiles(description),
      ...AIAgentService.extractMentionedFiles((task.acceptanceCriteria ?? "")),
      ...AIAgentService.extractMentionedFiles(checklist.join("\n")),
      ...AIAgentService.extractMentionedFiles(comments.join("\n")),
      ...(task.attachedFiles ?? []),
    ];
    const files = Array.from(new Set(mentionedFiles));
    const branch = task.branchName || task.aiAgents?.createdBranch || this.suggestBranchName(task);
    const testCommand = cfg.runCommandBeforeFinish || "";

    const labels =
      cfg.language === "en"
        ? {
            role: "You are an AI coding agent working inside this repository.",
            task: "TASK",
            context: "TASK CONTEXT",
            rules: "MANDATORY RULES",
            output: "REQUIRED FINAL OUTPUT",
            empty: "(none)",
            title: "Title",
            description: "Description",
            files: "Mentioned files",
            checklist: "Checklist",
            comments: "Task chat",
            branch: "Branch",
            command: "Configured test/build command",
            personas: "ATTACHED CURSOR PERSONAS",
            personasNote:
              "Follow the rules and conventions of every persona below — they describe the expected coding style and constraints for this task.",
          }
        : {
            role: "Jesteś agentem AI pracującym w tym repozytorium.",
            task: "ZADANIE",
            context: "KONTEKST ZADANIA",
            rules: "REGUŁY OBOWIĄZKOWE",
            output: "WYMAGANY WYNIK KOŃCOWY",
            empty: "(brak)",
            title: "Tytuł",
            description: "Opis",
            files: "Wskazane pliki",
            checklist: "Checklista",
            comments: "Czat zadania",
            branch: "Branch",
            command: "Skonfigurowana komenda test/build",
            personas: "DOŁĄCZONE PERSONY CURSOR",
            personasNote:
              "Zastosuj reguły i konwencje każdej z poniższych person — opisują one oczekiwany styl kodu i ograniczenia dla tego zadania.",
          };

    const block = (lines: string[]) => (lines.length ? lines.join("\n") : labels.empty);
    const personaSection = cursorAgents.length
      ? [
          "",
          `# ${labels.personas}`,
          labels.personasNote,
          ...cursorAgents.flatMap((persona) => [
            "",
            `## ${persona.name}`,
            persona.description ? `${labels.description}: ${persona.description}` : "",
            persona.body,
          ]),
        ]
      : [];
    return [
      labels.role,
      "",
      `# ${labels.task}`,
      `${labels.title}: ${task.title}`,
      `${labels.description}: ${description || labels.empty}`,
      `Typ: ${task.taskType ?? "feature"}`,
      `Priorytet: ${task.priority}`,
      `Kolumna/status: ${column?.name ?? task.columnId}`,
      `Przypisany: ${userName(task.assignedUserId) || labels.empty}`,
      `${labels.branch}: ${branch}`,
      `Obecny branch: ${git?.currentBranch ?? labels.empty}`,
      "",
      `# ${labels.context}`,
      `${labels.files}:`,
      block(files.map((file) => `- ${file}`)),
      "",
      `${labels.checklist}:`,
      block(checklist.map((line) => `- ${line}`)),
      "",
      `Kryteria akceptacji:`,
      task.acceptanceCriteria?.trim() || labels.empty,
      "",
      `${labels.comments}:`,
      block(comments.map((line) => `- ${line}`)),
      "",
      `${labels.command}: ${testCommand || labels.empty}`,
      ...personaSection,
      "",
      `# ${labels.rules}`,
      "1. Najpierw przeanalizuj wskazane pliki i reguły projektu.",
      "2. Nie zmieniaj plików niezwiązanych z zadaniem.",
      "3. Najpierw przygotuj krótki plan, dopiero potem wykonuj zmiany.",
      "4. Nie wykonuj merge, push, deploy ani usuwania branchy.",
      "5. Nie rób dużego refaktoru i nie zmieniaj architektury bez potrzeby.",
      "6. Zachowaj styl obecnego kodu i używaj istniejących helperów/komponentów.",
      "7. Nie commituj zmian.",
      "",
      `# ${labels.output}`,
      "- Lista zmienionych plików.",
      "- Opis zmian.",
      "- Instrukcja testowania.",
      "- Ryzyka.",
      "- Czy wszystkie podzadania są wykonane.",
    ].join("\n");
  }

  getAgent(agentId: string): AIAgentDefinition | null {
    const agent = (this.getConfig().aiAgents || []).find((candidate) => candidate.id === agentId);
    return agent && agent.enabled ? agent : null;
  }

  isAllowed(command: string): boolean {
    const cmd = (command || "").trim();
    if (!cmd) {
      return false;
    }
    if (path.isAbsolute(cmd)) {
      return (
        !AIAgentService.UNSAFE_PATH_COMMAND.test(cmd) &&
        (this.getConfig().allowedAIAgentCommands || []).includes(cmd)
      );
    }
    if (!AIAgentService.SAFE_BINARY_NAME.test(cmd)) {
      return false;
    }
    return (this.getConfig().allowedAIAgentCommands || []).includes(cmd);
  }

  private executableSearchDirs(): string[] {
    const pathDirs = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
    return Array.from(new Set([...pathDirs, ...AIAgentService.COMMON_EXECUTABLE_DIRS]));
  }

  private executableCandidates(command: string): string[] {
    const dirs = this.executableSearchDirs();
    if (process.platform !== "win32") {
      return dirs.map((dir) => path.join(dir, command));
    }

    const hasExtension = path.extname(command).length > 0;
    const extensions = hasExtension
      ? [""]
      : (process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM")
          .split(";")
          .map((ext) => ext.trim())
          .filter(Boolean);
    return dirs.flatMap((dir) => extensions.map((ext) => path.join(dir, `${command}${ext}`)));
  }

  private canExecute(file: string): boolean {
    try {
      const stat = fs.statSync(file);
      if (!stat.isFile()) {
        return false;
      }
      if (process.platform === "win32") {
        return true;
      }
      fs.accessSync(file, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }

  private resolveExecutable(command: string): AIAgentExecutableResolution {
    const cmd = (command || "").trim();
    if (path.isAbsolute(cmd)) {
      if (this.canExecute(cmd)) {
        return { ok: true, executable: cmd };
      }
      return {
        ok: false,
        message: t("aiAgent.commandMissing", { command: cmd }),
        detail: t("aiAgent.commandMissingAbsoluteDetail", { command: cmd }),
      };
    }

    for (const candidate of this.executableCandidates(cmd)) {
      if (this.canExecute(candidate)) {
        return { ok: true, executable: candidate };
      }
    }

    const searchedPaths = this.executableSearchDirs().slice(0, 16).join(path.delimiter);
    return {
      ok: false,
      message: t("aiAgent.commandMissing", { command: cmd }),
      detail: t("aiAgent.commandMissingDetail", { command: cmd, paths: searchedPaths || "(empty PATH)" }),
    };
  }

  private writePromptFile(task: BoardTask, kind: AIAgentRunKind, prompt: string): string {
    const dir = path.join(this.cwd, ".branchboard", "ai");
    fs.mkdirSync(dir, { recursive: true });
    const safeTask = task.id.replace(/[^a-z0-9_-]/gi, "_");
    const file = path.join(dir, `${safeTask}-${kind}-prompt.md`);
    fs.writeFileSync(file, prompt, "utf8");
    return file;
  }

  writePlanFile(task: BoardTask, plan: string, branchName: string, agentName: string): string {
    const dir = path.join(this.cwd, ".cursor", "plans");
    fs.mkdirSync(dir, { recursive: true });
    const safeTaskId = task.id.replace(/[^a-z0-9_-]/gi, "_").slice(0, 48) || "task";
    const safeTitle = AIAgentService.slug(task.title) || "plan";
    const file = path.join(dir, `${safeTaskId}-${safeTitle}.md`);
    const body = [
      `# ${task.title}`,
      "",
      `- Task ID: ${task.id}`,
      `- Branch: ${branchName || task.branchName || "(none)"}`,
      `- Agent: ${agentName}`,
      `- Created: ${new Date().toISOString()}`,
      "",
      "## Plan",
      "",
      plan.trim() || "(empty plan)",
      "",
    ].join("\n");
    fs.writeFileSync(file, body, "utf8");
    return path.relative(this.cwd, file).split(path.sep).join("/");
  }

  private substitute(
    value: string,
    ctx: {
      prompt: string;
      promptFile: string;
      model: string;
      branch: string;
      task: BoardTask;
      kind: AIAgentRunKind;
    }
  ): string {
    const map: Record<string, string> = {
      prompt: ctx.prompt,
      promptFile: ctx.promptFile,
      model: ctx.model,
      branch: ctx.branch,
      taskId: ctx.task.id,
      taskTitle: ctx.task.title,
      kind: ctx.kind,
    };
    return value.replace(/\{\{(\w+)\}\}/g, (whole, key) =>
      Object.prototype.hasOwnProperty.call(map, key) ? map[key] : whole
    );
  }

  preparePreview(
    agent: AIAgentDefinition,
    task: BoardTask,
    kind: AIAgentRunKind,
    prompt: string,
    model: string,
    branchName: string
  ): AIAgentPreview {
    const promptFile = this.writePromptFile(task, kind, prompt);
    const args = (agent.args || []).map((arg) =>
      this.substitute(arg, { prompt, promptFile, model, branch: branchName, task, kind })
    );
    return { agent, command: agent.command, args, promptFile, branchName };
  }

  /**
   * Builds a short, display-only version of the command-line args for use in
   * native VS Code modal dialogs (e.g. the "run agent?" confirmation). The
   * real `args` passed to `run()` always carry the full prompt text, but
   * dumping that into a `showWarningMessage({ modal: true })` detail makes
   * the dialog grow taller than the screen with no scrolling and no visible
   * confirm button. Here we replace the prompt with a short reference to the
   * prompt file (already shown elsewhere in the dialog and fully visible,
   * scrollable, in the webview's prompt preview) and cap any other
   * unexpectedly long argument.
   */
  summarizeArgsForDisplay(args: string[], prompt: string, promptFile: string, maxArgLen = 160): string[] {
    const promptRef = `<prompt: zobacz ${promptFile}>`;
    return args.map((arg) => {
      let value = arg;
      if (prompt && value.includes(prompt)) {
        value = value.split(prompt).join(promptRef);
      }
      if (value.length > maxArgLen) {
        value = `${value.slice(0, maxArgLen)}…`;
      }
      return value;
    });
  }

  /**
   * Parses an agent's "list models" stdout into a flat list of model
   * ids/slugs. Deliberately defensive and conservative: tries, in order, a
   * JSON array of strings, a JSON array of objects (picking an id/name/model
   * field), then falls back to one model per non-empty line of plain text
   * (stripping common list bullets). Returns an empty array — never throws —
   * if nothing recognizable is found, so the caller can report "couldn't
   * parse the CLI's output" instead of silently fabricating models.
   */
  private static parseModelList(stdout: string): string[] {
    const trimmed = (stdout || "").trim();
    if (!trimmed) {
      return [];
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        const ids = parsed
          .map((entry) => {
            if (typeof entry === "string") {
              return entry.trim();
            }
            if (entry && typeof entry === "object") {
              const obj = entry as Record<string, unknown>;
              const candidate = obj.id ?? obj.model ?? obj.name ?? obj.slug;
              return typeof candidate === "string" ? candidate.trim() : "";
            }
            return "";
          })
          .filter(Boolean);
        if (ids.length) {
          return Array.from(new Set(ids));
        }
      } else if (parsed && typeof parsed === "object") {
        const obj = parsed as Record<string, unknown>;
        const listField = obj.models ?? obj.data ?? obj.items;
        if (Array.isArray(listField)) {
          return AIAgentService.parseModelList(JSON.stringify(listField));
        }
      }
    } catch {
      /* Not JSON — fall through to plain-text line parsing below. */
    }
    const lines = trimmed
      .split("\n")
      .map((line) =>
        line
          .replace(/^[\s*\-•]+/, "")
          .replace(/^\d+[.)]\s*/, "")
          .trim()
      )
      .filter((line) => line.length > 0 && line.length <= 80 && !/^\{|\}$/.test(line));
    return Array.from(new Set(lines));
  }

  /**
   * Asks the agent's CLI for its available models by running
   * `agent.listModelsArgs`, if configured. Returns `{ ok: false }` with a
   * clear reason — never an invented model list — when listModelsArgs is
   * unset, the command is blocked/missing, the process exits non-zero, or
   * the output can't be parsed into anything model-shaped.
   */
  async listModels(agent: AIAgentDefinition): Promise<{ ok: boolean; models: string[]; message?: string; detail?: string }> {
    const listArgs = agent.listModelsArgs;
    if (!listArgs || listArgs.length === 0) {
      return { ok: false, models: [], message: t("aiAgent.modelsNoListCommand", { name: agent.name }) };
    }
    if (!this.isAllowed(agent.command)) {
      return {
        ok: false,
        models: [],
        message: t("aiAgent.commandBlocked", { command: agent.command }),
        detail: t("aiAgent.commandBlockedDetail"),
      };
    }
    const resolution = this.resolveExecutable(agent.command);
    if (!resolution.ok) {
      return { ok: false, models: [], message: resolution.message, detail: resolution.detail };
    }

    return new Promise((resolve) => {
      let stdoutBuf = "";
      let stderrBuf = "";
      let settled = false;
      let child: ChildProcess;
      const timeoutMs = 20_000;
      try {
        child = spawn(resolution.executable, listArgs, {
          cwd: this.cwd,
          shell: false,
          windowsHide: true,
          env: process.env,
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (err: any) {
        resolve({ ok: false, models: [], message: t("aiAgent.modelsFetchFailed", { name: agent.name }), detail: err?.message ?? String(err) });
        return;
      }
      const timeoutHandle = setTimeout(() => {
        child.kill("SIGTERM");
      }, timeoutMs);
      child.stdout?.on("data", (chunk: Buffer) => {
        stdoutBuf = (stdoutBuf + chunk.toString("utf8")).slice(-1_000_000);
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderrBuf = (stderrBuf + chunk.toString("utf8")).slice(-1_000_000);
      });
      child.on("error", (err: NodeJS.ErrnoException) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutHandle);
        resolve({ ok: false, models: [], message: t("aiAgent.modelsFetchFailed", { name: agent.name }), detail: err?.message ?? String(err) });
      });
      child.on("close", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutHandle);
        if (code !== 0) {
          resolve({
            ok: false,
            models: [],
            message: t("aiAgent.modelsFetchFailed", { name: agent.name }),
            detail: stderrBuf.trim() || `exit code ${code}`,
          });
          return;
        }
        const models = AIAgentService.parseModelList(stdoutBuf);
        if (!models.length) {
          resolve({ ok: false, models: [], message: t("aiAgent.modelsUnparseable", { name: agent.name }), detail: stdoutBuf.trim() });
          return;
        }
        resolve({ ok: true, models });
      });
    });
  }

  /**
   * Minimal spawn-and-collect helper used by `optimizePrompt` — unlike
   * `run()` it never streams to a live console and never writes to the
   * task's persisted state; it just runs a command, buffers stdout/stderr,
   * and resolves once the process exits (or is killed on timeout). Kept
   * separate from `run()` deliberately so the prompt-optimization pass
   * (throwaway, "just rewrite some text") can never affect the bookkeeping
   * (history, lifecycle events, changed files) of a real Plan/Run/Review.
   */
  private spawnCollect(
    executable: string,
    args: string[],
    timeoutMs: number
  ): Promise<{
    ok: boolean;
    code: number | null;
    stdout: string;
    stderr: string;
    timedOut: boolean;
    spawnError?: NodeJS.ErrnoException;
  }> {
    return new Promise((resolve) => {
      let stdoutBuf = "";
      let stderrBuf = "";
      let settled = false;
      let timedOut = false;
      let spawnError: NodeJS.ErrnoException | undefined;
      let child: ChildProcess;
      try {
        child = spawn(executable, args, {
          cwd: this.cwd,
          shell: false,
          windowsHide: true,
          env: process.env,
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (err: any) {
        resolve({ ok: false, code: null, stdout: "", stderr: "", timedOut: false, spawnError: err });
        return;
      }
      const timeoutHandle = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, timeoutMs);
      child.stdout?.on("data", (chunk: Buffer) => {
        stdoutBuf = (stdoutBuf + chunk.toString("utf8")).slice(-2_000_000);
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderrBuf = (stderrBuf + chunk.toString("utf8")).slice(-2_000_000);
      });
      child.on("error", (err: NodeJS.ErrnoException) => {
        spawnError = err;
      });
      child.on("close", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutHandle);
        resolve({ ok: !spawnError && !timedOut && code === 0, code, stdout: stdoutBuf, stderr: stderrBuf, timedOut, spawnError });
      });
    });
  }

  /**
   * Rewrites a prompt with a fast/cheap "optimizer" model before it is sent
   * to the real Plan/Run/Review agent — purely a text-rewriting pass, never
   * executes task work and never touches files. Used when
   * `branchBoard.optimizePromptsBeforeSend` is enabled. Always returns
   * `{ ok: true, prompt: rawPrompt }` worth falling back to on any failure —
   * callers should never block a real run because the optimizer hiccuped.
   */
  async optimizePrompt(
    agent: AIAgentDefinition,
    model: string,
    rawPrompt: string,
    rules: string,
    task: BoardTask,
    kind: AIAgentRunKind,
    branchName: string
  ): Promise<{ ok: boolean; prompt: string; message?: string; detail?: string }> {
    if (!this.isAllowed(agent.command)) {
      return {
        ok: false,
        prompt: rawPrompt,
        message: t("aiAgent.commandBlocked", { command: agent.command }),
        detail: t("aiAgent.commandBlockedDetail"),
      };
    }
    const resolution = this.resolveExecutable(agent.command);
    if (!resolution.ok) {
      return { ok: false, prompt: rawPrompt, message: resolution.message, detail: resolution.detail };
    }
    const instructionText = [
      "Twoje JEDYNE zadanie: przepisz poniższy prompt tak, by był lepiej dopasowany technicznie do agenta, który go wykona — zgodnie z poniższymi regułami. Zwróć WYŁĄCZNIE finalny, przepisany prompt, bez żadnego komentarza, bez znaczników markdown typu ``` i bez wstępu w stylu „Oto przepisany prompt:”. Nie wykonuj żadnych zadań opisanych w prompcie, nie czytaj i nie zmieniaj żadnych plików — tylko przepisz tekst.",
      "",
      "# REGUŁY OPTYMALIZACJI",
      rules || "(brak dodatkowych reguł — zachowaj sens i wszystkie fakty, popraw tylko jasność i strukturę)",
      "",
      "# ORYGINALNY PROMPT",
      rawPrompt,
    ].join("\n");
    const promptFile = this.writePromptFile(task, kind, instructionText);
    const args = (agent.args || []).map((arg) =>
      this.substitute(arg, { prompt: instructionText, promptFile, model, branch: branchName, task, kind })
    );
    const cfg = this.getConfig();
    const timeoutMs = Math.min(Math.max(1, cfg.aiAgentTimeoutSeconds || 900), 180) * 1000;
    const collected = await this.spawnCollect(resolution.executable, args, timeoutMs);
    if (!collected.ok) {
      const missing = collected.spawnError?.code === "ENOENT";
      return {
        ok: false,
        prompt: rawPrompt,
        message: missing
          ? t("aiAgent.commandMissing", { command: agent.command })
          : collected.timedOut
            ? t("aiAgent.timedOut", { seconds: String(Math.round(timeoutMs / 1000)) })
            : t("aiAgent.optimizeFailed", { name: agent.name }),
        detail: collected.stderr?.trim() || collected.spawnError?.message,
      };
    }
    const parsed = this.parseOutput(collected.stdout);
    let optimized = (parsed.result || parsed.plan || parsed.reviewResult || collected.stdout || "").trim();
    optimized = optimized
      .replace(/^```[a-z]*\n?/i, "")
      .replace(/```\s*$/, "")
      .trim();
    if (!optimized) {
      return { ok: false, prompt: rawPrompt, message: t("aiAgent.optimizeEmpty", { name: agent.name }) };
    }
    return { ok: true, prompt: optimized };
  }

  /**
   * Runs the agent binary and streams its stdout/stderr live via
   * `handlers.onChunk` as data arrives, instead of buffering everything
   * until the process exits. This is what lets the WebView show a
   * Cursor-chat-like live console while the agent is working, and is also
   * what makes a "Stop" button possible — `handlers.onProcessStarted` hands
   * the caller the live ChildProcess so it can `.kill()` it on demand.
   */
  async run(
    preview: AIAgentPreview,
    kind: AIAgentRunKind,
    handlers: AIAgentRunHandlers = {}
  ): Promise<AIAgentProcessResult> {
    const started = Date.now();
    if (!this.isAllowed(preview.command)) {
      return {
        ok: false,
        action: `aiAgent.${kind}`,
        status: "failed",
        message: t("aiAgent.commandBlocked", { command: preview.command }),
        detail: t("aiAgent.commandBlockedDetail"),
        stdout: "",
        stderr: "",
        promptFile: preview.promptFile,
        durationMs: 0,
      };
    }

    const resolution = this.resolveExecutable(preview.command);
    if (!resolution.ok) {
      return {
        ok: false,
        action: `aiAgent.${kind}`,
        status: "failed",
        message: resolution.message || t("aiAgent.commandMissing", { command: preview.command }),
        detail: resolution.detail,
        stdout: "",
        stderr: "",
        promptFile: preview.promptFile,
        durationMs: Date.now() - started,
      };
    }
    const executable = resolution.executable;

    if (executable !== preview.command) {
      Logger.debug(`[ai-agent] resolved ${preview.command} -> ${executable}`);
    }

    const maxBuffer = 20 * 1024 * 1024;
    const timeoutMs = Math.max(1, this.getConfig().aiAgentTimeoutSeconds || 900) * 1000;
    // Detects how the agent was asked to talk to us so the live console
    // knows what to do with stdout as it arrives — see the doc comment on
    // detectOutputFormat / formatStreamJsonEvent for why this matters: a
    // buffered "json" CLI writes nothing readable until it exits (the
    // process itself withholds it, not us), while "stream-json" emits one
    // JSON object per line and can genuinely be shown live.
    const outputFormat = detectOutputFormat(preview.args);

    return new Promise((resolve) => {
      let stdoutBuf = "";
      let stderrBuf = "";
      let ndjsonLineRemainder = "";
      let settled = false;
      let timedOut = false;
      let cancelled = false;
      let spawnError: NodeJS.ErrnoException | null = null;

      let child: ChildProcess;
      try {
        child = spawn(executable, preview.args, {
          cwd: this.cwd,
          shell: false,
          windowsHide: true,
          env: process.env,
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (err: any) {
        resolve({
          ok: false,
          action: `aiAgent.${kind}`,
          status: "failed",
          message: `AI agent '${preview.agent.name}' failed to start.`,
          detail: err?.message ?? String(err),
          stdout: "",
          stderr: "",
          promptFile: preview.promptFile,
          durationMs: Date.now() - started,
        });
        return;
      }

      handlers.onProcessStarted?.(child);

      const timeoutHandle = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, timeoutMs);

      const appendChunk = (stream: "stdout" | "stderr", chunk: Buffer) => {
        const text = chunk.toString("utf8");
        if (stream === "stdout") {
          stdoutBuf = (stdoutBuf + text).slice(-maxBuffer);
          if (outputFormat === "stream-json") {
            // NDJSON: only complete lines are valid JSON, so buffer any
            // trailing partial line until the next chunk completes it.
            ndjsonLineRemainder += text;
            const lines = ndjsonLineRemainder.split("\n");
            ndjsonLineRemainder = lines.pop() ?? "";
            for (const line of lines) {
              const trimmedLine = line.trim();
              if (!trimmedLine) continue;
              try {
                const obj = JSON.parse(trimmedLine);
                const pretty = obj && typeof obj === "object" ? formatStreamJsonEvent(obj) : null;
                if (pretty) {
                  handlers.onChunk?.("stdout", pretty + "\n");
                }
              } catch {
                // Not valid JSON on its own — forward as-is so nothing is lost.
                handlers.onChunk?.("stdout", trimmedLine + "\n");
              }
            }
            return;
          }
          if (outputFormat === "json") {
            // The CLI itself buffers its entire response and writes it in
            // one shot at exit — forwarding these raw fragments live would
            // just flash an unreadable, partial JSON blob. The status pulse
            // in the UI already shows the agent is working; the formatted
            // result + usage are appended once at process close instead.
            return;
          }
        } else {
          stderrBuf = (stderrBuf + text).slice(-maxBuffer);
        }
        handlers.onChunk?.(stream, text);
      };

      child.stdout?.on("data", (chunk: Buffer) => appendChunk("stdout", chunk));
      child.stderr?.on("data", (chunk: Buffer) => appendChunk("stderr", chunk));
      child.on("error", (err: NodeJS.ErrnoException) => {
        spawnError = err;
      });

      child.on("close", (code, signal) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeoutHandle);
        const durationMs = Date.now() - started;
        const out = stdoutBuf;
        const errOut = stderrBuf;
        const parsed = this.parseOutput(out);
        const missing = spawnError?.code === "ENOENT";
        // Only treat as cancelled if we didn't already kill it ourselves for timing out,
        // and it didn't exit cleanly on its own (code === 0, no signal).
        cancelled = !timedOut && signal != null && code !== 0;
        const ok = !spawnError && !timedOut && !cancelled && code === 0;

        // For buffered "json"/"stream-json" CLIs the live console deliberately
        // withheld the raw, unreadable JSON above (see appendChunk) — append
        // one clean, formatted block now that we have the full parsed result
        // and usage, instead of ever showing the raw blob.
        if (ok && (outputFormat === "json" || outputFormat === "stream-json") && handlers.onChunk) {
          const resultText = parsed.result || parsed.reviewResult || parsed.plan;
          if (resultText?.trim()) {
            handlers.onChunk("system", `\n— ${t("aiAgent.consoleResultHeading")} —\n${resultText.trim()}\n`);
          }
          if (parsed.usage) {
            handlers.onChunk("system", `\n${this.formatUsageLine(parsed.usage)}\n`);
          }
        }

        resolve({
          ok,
          action: `aiAgent.${kind}`,
          status: ok ? "finished" : cancelled ? "cancelled" : "failed",
          cancelled,
          message: ok
            ? `AI agent '${preview.agent.name}' finished.`
            : missing
              ? t("aiAgent.commandMissing", { command: preview.command })
              : timedOut
                ? t("aiAgent.timedOut", { seconds: String(Math.round(timeoutMs / 1000)) })
                : cancelled
                  ? t("aiAgent.cancelledByUser")
                  : `AI agent '${preview.agent.name}' failed.`,
          detail: ok
            ? undefined
            : missing
              ? t("aiAgent.commandMissingDetail", {
                  command: preview.command,
                  paths: this.executableSearchDirs().slice(0, 16).join(path.delimiter) || "(empty PATH)",
                })
              : errOut || spawnError?.message,
          stdout: out,
          stderr: errOut,
          promptFile: preview.promptFile,
          durationMs,
          plan: parsed.plan,
          result: parsed.result,
          reviewResult: parsed.reviewResult,
          usage: parsed.usage,
        });
      });
    });
  }

  /** Formats a token-usage object into one readable console line. */
  private formatUsageLine(usage: AIAgentUsage): string {
    const fmt = (n: number | undefined) => (typeof n === "number" ? n.toLocaleString("pl-PL") : "—");
    return t("aiAgent.consoleUsageLine", {
      input: fmt(usage.inputTokens),
      output: fmt(usage.outputTokens),
      cacheRead: fmt(usage.cacheReadTokens),
      cacheWrite: fmt(usage.cacheWriteTokens),
    });
  }

  /**
   * Extracts plan/result/reviewResult/usage from an agent's stdout. Handles
   * three shapes, in order: a single JSON object (buffered `--output-format
   * json`), NDJSON / stream-json (one JSON object per line, usage and result
   * carried on the final `{"type":"result", ...}` event), and plain free
   * text (the whole trimmed stdout becomes the result).
   */
  private parseOutput(stdout: string): {
    plan?: string;
    result?: string;
    reviewResult?: string;
    usage?: AIAgentUsage;
  } {
    const trimmed = stdout.trim();
    if (!trimmed) {
      return {};
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object") {
        return {
          plan: typeof parsed.plan === "string" ? parsed.plan : undefined,
          result:
            typeof parsed.result === "string"
              ? parsed.result
              : typeof parsed.text === "string"
                ? parsed.text
                : undefined,
          reviewResult: typeof parsed.reviewResult === "string" ? parsed.reviewResult : undefined,
          usage: normalizeAIAgentUsage(parsed.usage),
        };
      }
    } catch {
      /* Not a single JSON value — fall through and try NDJSON below. */
    }
    const lines = trimmed.split("\n").map((line) => line.trim()).filter(Boolean);
    if (lines.length > 1) {
      let lastResultEvent: Record<string, unknown> | null = null;
      let sawAnyJsonLine = false;
      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          if (obj && typeof obj === "object") {
            sawAnyJsonLine = true;
            if ((obj as Record<string, unknown>).type === "result") {
              lastResultEvent = obj as Record<string, unknown>;
            }
          }
        } catch {
          /* This line wasn't JSON on its own — this isn't NDJSON after all. */
        }
      }
      if (sawAnyJsonLine && lastResultEvent) {
        return {
          result: typeof lastResultEvent.result === "string" ? lastResultEvent.result : undefined,
          usage: normalizeAIAgentUsage(lastResultEvent.usage),
        };
      }
    }
    return { result: trimmed };
  }

  static mapGitStatus(status: string): AIAgentChangedFile["status"] {
    const code = (status || "").trim();
    if (code.startsWith("A") || code.endsWith("A") || code === "??") {
      return "added";
    }
    if (code.startsWith("D") || code.endsWith("D")) {
      return "deleted";
    }
    if (code.startsWith("R") || code.endsWith("R")) {
      return "renamed";
    }
    return "modified";
  }
}
