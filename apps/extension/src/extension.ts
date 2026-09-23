import * as vscode from "vscode";

// Node built-ins exist in the extension host; this package ships without @types/node.
declare function require(id: "node:fs"): { readFileSync(path: string, encoding: "utf8"): string };
declare function require(id: "node:os"): { homedir(): string };
const { readFileSync } = require("node:fs");
const { homedir } = require("node:os");

/**
 * This OS user's connector. Each user on a computer has their own port,
 * recorded by the connector, so two people never report through one connector.
 */
function connectorBase(): string {
  try {
    const port = Number(
      readFileSync(`${homedir()}/.techlio-connector/port`, "utf8").trim(),
    );
    if (port > 0) return `http://127.0.0.1:${port}`;
  } catch {
    /* connector not started yet: default port */
  }
  return "http://127.0.0.1:9477";
}
const SESSION_ID = globalThis.crypto.randomUUID();
const EDIT_THROTTLE_MS = 30_000;
const SESSION_PULSE_MS = 120_000;

function hostProvider(): string {
  const name = vscode.env.appName.toLowerCase();
  if (name.includes("cursor")) return "cursor";
  if (name.includes("visual studio code")) return "vscode";
  return "cursor";
}

function workspaceName(uri?: vscode.Uri): string {
  const folder = uri
    ? vscode.workspace.getWorkspaceFolder(uri)
    : vscode.workspace.workspaceFolders?.[0];
  const name = folder?.name ?? vscode.workspace.name;
  return (name ?? "untitled").slice(0, 64);
}

function relativePath(uri: vscode.Uri): string {
  return vscode.workspace.asRelativePath(uri).slice(0, 512);
}

function shouldIgnore(uri: vscode.Uri): boolean {
  const s = uri.scheme;
  if (s !== "file") return true;
  const p = uri.fsPath.replace(/\\/g, "/");
  return (
    p.includes("/node_modules/") ||
    p.includes("/.git/") ||
    p.includes("/.next/") ||
    p.includes("/dist/")
  );
}

async function postJson(path: string, body: Record<string, unknown>): Promise<void> {
  try {
    await fetch(`${connectorBase()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    /* connector offline — retry on the next event */
  }
}

async function postExtensionEvent(body: Record<string, unknown>): Promise<void> {
  await postJson("/hooks/extension", {
    session_id: SESSION_ID,
    provider: hostProvider(),
    appName: vscode.env.appName,
    workspace: workspaceName(),
    ...body,
  });
}

export function activate(context: vscode.ExtensionContext) {
  const status = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  status.text = `Techlio: ${hostProvider()}`;
  status.tooltip = "Reporting allowlisted IDE activity to the local Techlio connector";
  status.show();

  void postJson("/host", {
    provider: hostProvider(),
    appName: vscode.env.appName,
    workspace: workspaceName(),
  });
  void postExtensionEvent({
    event_type: "session_started",
    label: workspaceName(),
  });

  const lastEditAt = new Map<string, number>();

  context.subscriptions.push(
    vscode.commands.registerCommand("techlio.pauseCollection", async () => {
      await fetch(`${connectorBase()}/pause`, { method: "POST" });
      status.text = "Techlio: paused";
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("techlio.resumeCollection", async () => {
      await fetch(`${connectorBase()}/resume`, { method: "POST" });
      status.text = `Techlio: ${hostProvider()}`;
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("techlio.setTaskContext", async () => {
      const label = await vscode.window.showInputBox({
        prompt: "Project / work item label",
      });
      if (label) {
        await postExtensionEvent({
          event_type: "task_context_changed",
          label,
        });
        vscode.window.showInformationMessage(`Context set: ${label}`);
      }
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (shouldIgnore(doc.uri)) return;
      void postExtensionEvent({
        event_type: "file_modified",
        file_path: relativePath(doc.uri),
        workspace: workspaceName(doc.uri),
        label: workspaceName(doc.uri),
      });
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidCreateFiles((e) => {
      for (const file of e.files) {
        if (shouldIgnore(file)) continue;
        void postExtensionEvent({
          event_type: "file_created",
          file_path: relativePath(file),
          workspace: workspaceName(file),
          label: workspaceName(file),
        });
      }
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidDeleteFiles((e) => {
      for (const file of e.files) {
        if (shouldIgnore(file)) continue;
        void postExtensionEvent({
          event_type: "file_deleted",
          file_path: relativePath(file),
          workspace: workspaceName(file),
          label: workspaceName(file),
        });
      }
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      const uri = e.document.uri;
      if (shouldIgnore(uri) || e.contentChanges.length === 0) return;
      const key = uri.toString();
      const now = Date.now();
      const prev = lastEditAt.get(key) ?? 0;
      if (now - prev < EDIT_THROTTLE_MS) return;
      lastEditAt.set(key, now);
      void postExtensionEvent({
        event_type: "file_modified",
        file_path: relativePath(uri),
        workspace: workspaceName(uri),
        label: workspaceName(uri),
      });
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      void postExtensionEvent({
        event_type: "task_context_changed",
        label: workspaceName(),
        workspace: workspaceName(),
      });
    }),
  );

  context.subscriptions.push(
    vscode.tasks.onDidEndTaskProcess((e) => {
      const name = e.execution.task.name.toLowerCase();
      let eventType: string | null = null;
      if (name.includes("test")) eventType = "test_completed";
      else if (name.includes("build")) eventType = "build_completed";
      else if (name.includes("lint")) eventType = "lint_completed";
      if (eventType) {
        void postExtensionEvent({
          event_type: eventType,
          label: workspaceName(),
          workspace: workspaceName(),
        });
      }
    }),
  );

  const pulse = setInterval(() => {
    if (!vscode.window.state.focused) return;
    void postExtensionEvent({
      event_type: "session_heartbeat",
      label: workspaceName(),
      workspace: workspaceName(),
    });
  }, SESSION_PULSE_MS);
  context.subscriptions.push({ dispose: () => clearInterval(pulse) });
}

export function deactivate() {
  void postExtensionEvent({ event_type: "session_ended" });
}
