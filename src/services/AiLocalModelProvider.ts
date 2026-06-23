import { execFile } from "child_process";
import * as http from "http";
import * as https from "https";
import { URL } from "url";
import { AiContextLevel, AiDecisionAction, BranchBoardConfig } from "../types";

/** What we ask the local model to advise on — never includes secrets or full file contents. */
export interface LocalAdvisorRequest {
  taskTitle: string;
  userMessage: string;
  fileCount: number;
  hasUncommittedChanges: boolean;
  costMode: BranchBoardConfig["aiCostMode"];
  defaultContextLevel: AiContextLevel;
  /** Short rolling summary instead of full history, if one exists. */
  chatSummary?: string;
}

/**
 * The ONLY shape we ever accept back from a local model. Anything outside
 * this — including a "command", "cmd", "exec", "shell", or similar field —
 * is silently dropped. The local model is advisory-only: it never executes
 * code, never runs Git, and BranchBoard never executes anything it returns.
 */
export interface LocalAdvisorSuggestion {
  action?: AiDecisionAction;
  contextLevel?: AiContextLevel;
  modelPreference?: string;
  reason?: string;
}

const ALLOWED_ACTIONS: AiDecisionAction[] = [
  "answer_local",
  "prepare_prompt",
  "cursor_plan",
  "cursor_work",
  "cursor_review",
];
const ALLOWED_LEVELS: AiContextLevel[] = ["small", "normal", "full"];

export interface LocalAdvisorResult {
  ok: boolean;
  suggestion?: LocalAdvisorSuggestion;
  error?: string;
}

/**
 * Optional advisory layer over a local model. Two transports:
 *  - local-command: execFile (shell:false) with the JSON request written to
 *    stdin and a single JSON object expected on stdout.
 *  - openai-compatible-http: a local/self-hosted OpenAI-style chat endpoint.
 *
 * Both transports are wrapped in a hard timeout and strict output
 * validation — only the fields in LocalAdvisorSuggestion are ever read back;
 * everything else (including any "run this command" style field) is
 * discarded before it reaches the rest of BranchBoard.
 */
export class AiLocalModelProvider {
  constructor(private readonly cwd: string, private readonly getConfig: () => BranchBoardConfig) {}

  async getSuggestion(request: LocalAdvisorRequest): Promise<LocalAdvisorResult> {
    const cfg = this.getConfig().aiLocalOptimizer;
    if (!cfg?.enabled) {
      return { ok: false, error: "disabled" };
    }
    try {
      const raw =
        cfg.provider === "openai-compatible-http"
          ? await this.callHttp(request, cfg)
          : await this.callCommand(request, cfg);
      const suggestion = sanitizeSuggestion(raw);
      if (!suggestion) {
        return { ok: false, error: "Local model returned no usable suggestion." };
      }
      return { ok: true, suggestion };
    } catch (err: any) {
      return { ok: false, error: err?.message || String(err) };
    }
  }

  private async callCommand(
    request: LocalAdvisorRequest,
    cfg: BranchBoardConfig["aiLocalOptimizer"]
  ): Promise<unknown> {
    const command = (cfg.command || "").trim();
    if (!command) {
      throw new Error("branchBoard.aiLocalOptimizer.command is not set.");
    }
    if (/[\\/]|\.\.|[\s;&|<>$`(){}\[\]'"]/.test(command)) {
      throw new Error(`Local optimizer command '${command}' contains characters that are not allowed.`);
    }
    const args = (cfg.args || []).slice();
    const input = JSON.stringify({ ...request, model: cfg.model || undefined });

    return new Promise((resolve, reject) => {
      const child = execFile(
        command,
        args,
        {
          cwd: this.cwd,
          shell: false,
          windowsHide: true,
          timeout: Math.max(1, cfg.timeoutSec || 30) * 1000,
          maxBuffer: 2 * 1024 * 1024,
          env: process.env,
        },
        (err, stdout) => {
          if (err) {
            reject(new Error(`Local optimizer command failed: ${err.message}`));
            return;
          }
          try {
            resolve(JSON.parse(stdout.toString()));
          } catch {
            reject(new Error("Local optimizer command did not return valid JSON."));
          }
        }
      );
      child.stdin?.write(input);
      child.stdin?.end();
    });
  }

  private async callHttp(
    request: LocalAdvisorRequest,
    cfg: BranchBoardConfig["aiLocalOptimizer"]
  ): Promise<unknown> {
    const endpoint = (cfg.endpoint || "").trim();
    if (!endpoint) {
      throw new Error("branchBoard.aiLocalOptimizer.endpoint is not set.");
    }
    const url = new URL(endpoint.replace(/\/+$/, "") + "/chat/completions");
    const transport = url.protocol === "https:" ? https : http;

    const instructions =
      "You are a cost-routing advisor for a developer tool. Reply with ONLY a single JSON object " +
      '(no prose, no markdown fences) with optional keys: "action" (one of ' +
      `${ALLOWED_ACTIONS.join("|")}), "contextLevel" (one of ${ALLOWED_LEVELS.join("|")}), ` +
      '"modelPreference" (a short model name string), "reason" (one short sentence). ' +
      "Never include a command, shell, exec, or file-write field — those are not used and will be ignored.";

    const body = JSON.stringify({
      model: cfg.model || undefined,
      temperature: 0,
      messages: [
        { role: "system", content: instructions },
        { role: "user", content: JSON.stringify(request) },
      ],
    });

    const responseText = await new Promise<string>((resolve, reject) => {
      const req = transport.request(
        {
          hostname: url.hostname,
          port: url.port || (url.protocol === "https:" ? 443 : 80),
          path: url.pathname + (url.search || ""),
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
          },
          timeout: Math.max(1, cfg.timeoutSec || 30) * 1000,
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => resolve(data));
        }
      );
      req.on("timeout", () => req.destroy(new Error("Local optimizer HTTP request timed out.")));
      req.on("error", reject);
      req.write(body);
      req.end();
    });

    let parsedResponse: any;
    try {
      parsedResponse = JSON.parse(responseText);
    } catch {
      throw new Error("Local optimizer endpoint did not return valid JSON.");
    }
    const content = parsedResponse?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error("Local optimizer endpoint response had no message content.");
    }
    try {
      return JSON.parse(extractJsonObject(content));
    } catch {
      throw new Error("Local optimizer model reply was not a JSON object.");
    }
  }
}

/** Pulls a `{...}` object out of a reply even if the model wrapped it in prose/fences. */
function extractJsonObject(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    return text;
  }
  return text.slice(start, end + 1);
}

/** Strict allowlist filter — drops every field except the ones we explicitly support. */
function sanitizeSuggestion(raw: unknown): LocalAdvisorSuggestion | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  const suggestion: LocalAdvisorSuggestion = {};

  if (typeof obj.action === "string" && ALLOWED_ACTIONS.includes(obj.action as AiDecisionAction)) {
    suggestion.action = obj.action as AiDecisionAction;
  }
  if (typeof obj.contextLevel === "string" && ALLOWED_LEVELS.includes(obj.contextLevel as AiContextLevel)) {
    suggestion.contextLevel = obj.contextLevel as AiContextLevel;
  }
  if (typeof obj.modelPreference === "string" && obj.modelPreference.length <= 80) {
    suggestion.modelPreference = obj.modelPreference;
  }
  if (typeof obj.reason === "string") {
    suggestion.reason = obj.reason.slice(0, 400);
  }

  return Object.keys(suggestion).length > 0 ? suggestion : undefined;
}
