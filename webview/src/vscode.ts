// Thin wrapper around the VS Code webview messaging API.

interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

let api: VsCodeApi;
try {
  api = acquireVsCodeApi();
} catch {
  // Running outside VS Code (e.g. `vite dev`) — log instead.
  api = {
    postMessage: (m) => console.log("[postMessage]", m),
    getState: () => undefined,
    setState: () => undefined,
  };
}

let reqCounter = 0;

export function post(type: string, payload?: unknown): string {
  const requestId = `req_${++reqCounter}`;
  api.postMessage({ type, payload, requestId });
  return requestId;
}

export const vscode = api;
