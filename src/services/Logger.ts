import * as vscode from "vscode";

/**
 * Single shared output channel ("BranchBoard") for debug logging. Any service can
 * call Logger.info/debug/error without threading the channel through. Reveal it
 * with the BranchBoard: Show Logs command.
 */
let channel: vscode.OutputChannel | undefined;

function ts(): string {
  return new Date().toISOString().replace("T", " ").replace("Z", "");
}

function write(level: string, msg: string) {
  if (!channel) {
    channel = vscode.window.createOutputChannel("BranchBoard");
  }
  channel.appendLine(`[${ts()}] ${level.padEnd(5)} ${msg}`);
}

export const Logger = {
  init() {
    if (!channel) {
      channel = vscode.window.createOutputChannel("BranchBoard");
    }
  },
  show() {
    Logger.init();
    channel!.show(true);
  },
  info(msg: string) {
    write("INFO", msg);
  },
  warn(msg: string) {
    write("WARN", msg);
  },
  error(msg: string) {
    write("ERROR", msg);
  },
  debug(msg: string) {
    write("DEBUG", msg);
  },
  /** Truncate long command output for readable logs. */
  trunc(s: string, n = 400): string {
    const one = (s ?? "").replace(/\s+/g, " ").trim();
    return one.length > n ? `${one.slice(0, n)}… (+${one.length - n} chars)` : one;
  },
  dispose() {
    channel?.dispose();
    channel = undefined;
  },
};
