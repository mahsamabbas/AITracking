import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Every install writes under a throwaway home directory, never the real one.
const home = mkdtempSync(join(tmpdir(), "techlio-hooks-"));
const realHome = process.env.HOME;

const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));

describe("agent hook installers", () => {
  let hooks: typeof import("./agent-hooks.js");

  beforeAll(async () => {
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    // Windsurf and Codex are "installed"; the user already has their own Windsurf hook.
    mkdirSync(join(home, ".codeium", "windsurf"), { recursive: true });
    writeFileSync(
      join(home, ".codeium", "windsurf", "hooks.json"),
      JSON.stringify({ hooks: { pre_run_command: [{ command: "my-audit.sh" }] } }),
    );
    mkdirSync(join(home, ".codex"), { recursive: true });
    hooks = await import("./agent-hooks.js");
  });

  afterAll(() => {
    process.env.HOME = realHome;
    process.env.USERPROFILE = realHome;
    rmSync(home, { recursive: true, force: true });
  });

  it("registers Windsurf, Copilot and Codex hooks next to the user's own", () => {
    const status = hooks.ensureAgentHooks();
    expect(status).toMatchObject({ claude: true, cursor: true, windsurf: true, copilot: true, codex: true });

    const windsurf = readJson(join(home, ".codeium", "windsurf", "hooks.json")).hooks;
    expect(windsurf.pre_run_command).toHaveLength(2);
    expect(windsurf.pre_run_command[0]).toEqual({ command: "my-audit.sh" });
    expect(JSON.stringify(windsurf.post_write_code)).toContain("windsurf");

    const copilot = readJson(join(home, ".copilot", "hooks", "techlio-connector.json"));
    expect(copilot.version).toBe(1);
    expect(Object.keys(copilot.hooks)).toEqual(
      expect.arrayContaining(["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop"]),
    );
    expect(copilot.hooks.PreToolUse[0].command).toContain("github_copilot PreToolUse");

    const codex = readJson(join(home, ".codex", "hooks.json")).hooks;
    expect(codex.PreToolUse[0].matcher).toBe(".*");
    expect(JSON.stringify(codex.Stop)).toContain("codex");
  });

  it("never registers twice when the connector restarts", () => {
    hooks.ensureAgentHooks();
    const windsurf = readJson(join(home, ".codeium", "windsurf", "hooks.json")).hooks;
    expect(windsurf.pre_run_command).toHaveLength(2);
    expect(readJson(join(home, ".codex", "hooks.json")).hooks.Stop).toHaveLength(1);
  });

  it("the generated hook script reports an allowlisted body to the connector", async () => {
    const received: Record<string, unknown>[] = [];
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        received.push(JSON.parse(body));
        res.end("{}");
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    mkdirSync(join(home, ".techlio-connector"), { recursive: true });
    writeFileSync(join(home, ".techlio-connector", "port"), String(port));

    const script = join(home, ".techlio", "connector", "report-hook.mjs");
    expect(existsSync(script)).toBe(true);
    const child = spawn(process.execPath, [script, "windsurf"], { env: { ...process.env, HOME: home } });
    child.stdin.end(
      JSON.stringify({
        agent_action_name: "post_write_code",
        trajectory_id: "traj",
        tool_info: { file_path: "/repo/a.ts", edits: [{ new_string: "private code" }] },
      }),
    );
    const stdout = await new Promise<string>((resolve) => {
      let out = "";
      child.stdout.on("data", (chunk) => (out += chunk));
      child.on("close", () => resolve(out));
    });
    server.close();

    expect(stdout.trim()).toBe("{}");
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ provider: "windsurf", hook_event_name: "PostToolUse", file_path: "/repo/a.ts" });
    expect(JSON.stringify(received[0])).not.toContain("private");
  });

  it("uninstall removes only the connector's hooks", () => {
    hooks.removeAgentHooks();
    const windsurf = readJson(join(home, ".codeium", "windsurf", "hooks.json")).hooks;
    expect(windsurf.pre_run_command).toEqual([{ command: "my-audit.sh" }]);
    expect(windsurf.post_write_code).toBeUndefined();
    expect(existsSync(join(home, ".copilot", "hooks", "techlio-connector.json"))).toBe(false);
    expect(readJson(join(home, ".codex", "hooks.json")).hooks).toEqual({});
  });
});
