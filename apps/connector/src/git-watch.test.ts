import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createGitWatcher, type CommitSignal } from "./git-watch.js";

const base = mkdtempSync(join(tmpdir(), "techlio-git-"));
const remote = join(base, "remote.git");
const repo = join(base, "repo");
const stateDir = join(base, "state");
const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" });

execFileSync("git", ["init", "--bare", "-q", remote]);
execFileSync("git", ["init", "-q", repo]);
git(repo, "config", "user.email", "dev@example.test");
git(repo, "config", "user.name", "Dev");
git(repo, "remote", "add", "origin", remote);

afterAll(() => rmSync(base, { recursive: true, force: true }));

describe("git watcher: Commit → Verified → Shipped", () => {
  const signals: CommitSignal[] = [];
  const watcher = createGitWatcher({ stateDir, isActive: () => true, emit: (s) => signals.push(s) });

  it("reports a new commit by this git user with counts only, verified after a passing check", async () => {
    await watcher.observe(repo);
    await watcher.markCheck(repo);
    writeFileSync(join(repo, "a.ts"), "one\ntwo\nthree\n");
    writeFileSync(join(repo, "b.ts"), "x\n");
    git(repo, "add", ".");
    git(repo, "commit", "-q", "-m", "secret message");
    await watcher.scanNow(repo);

    const created = signals.filter((s) => s.type === "commit_created");
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ filesChanged: 2, linesAdded: 4, linesDeleted: 0, verified: true });
    // Nothing identifying leaves the machine: no hash, message, or author.
    const hash = git(repo, "rev-parse", "HEAD").trim();
    expect(JSON.stringify(created[0])).not.toContain(hash);
    expect(JSON.stringify(created[0])).not.toContain("secret message");
    expect(JSON.stringify(created[0])).not.toContain("dev@example.test");
  });

  it("never counts the same commit twice and ignores commits by other authors", async () => {
    await watcher.scanNow(repo);
    git(repo, "-c", "user.email=someone@else.test", "commit", "-q", "--allow-empty", "-m", "theirs");
    await watcher.scanNow(repo);
    expect(signals.filter((s) => s.type === "commit_created")).toHaveLength(1);
  });

  it("marks the commit shipped once it reaches the remote", async () => {
    git(repo, "push", "-q", "origin", "HEAD:main");
    await watcher.scanNow(repo);
    const pushed = signals.filter((s) => s.type === "commit_pushed");
    expect(pushed).toHaveLength(1);
    expect(pushed[0].ref).toBe(signals.find((s) => s.type === "commit_created")!.ref);
  });

  it("does not report a commit made without a recent passing check as verified", async () => {
    const other = join(base, "other");
    execFileSync("git", ["init", "-q", other]);
    git(other, "config", "user.email", "dev@example.test");
    await watcher.observe(other);
    writeFileSync(join(other, "c.ts"), "c\n");
    git(other, "add", ".");
    git(other, "commit", "-q", "-m", "unchecked");
    await watcher.scanNow(other);
    expect(signals.filter((s) => s.type === "commit_created").at(-1)).toMatchObject({ verified: false, filesChanged: 1 });
  });

  it("picks up commits made before the connector saw the repo (from git), never as verified", async () => {
    const early = join(base, "early");
    execFileSync("git", ["init", "-q", early]);
    git(early, "config", "user.email", "dev@example.test");
    writeFileSync(join(early, "d.ts"), "d\ne\n");
    git(early, "add", ".");
    git(early, "commit", "-q", "-m", "made while the connector was not running");
    const before = signals.length;
    await watcher.scanNow(early); // first time this repo is seen
    const found = signals.slice(before).filter((s) => s.type === "commit_created");
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ filesChanged: 1, linesAdded: 2, verified: false });
  });

  it("reports commits that include large binary files (installers, executables)", async () => {
    const bin = join(base, "bin");
    execFileSync("git", ["init", "-q", bin]);
    git(bin, "config", "user.email", "dev@example.test");
    const before = signals.length;
    for (let i = 0; i < 3; i++) {
      // 2 MB, above the big-file threshold: counted as a changed file, never diffed.
      writeFileSync(join(bin, "installer.pkg"), Buffer.alloc(2 * 1024 * 1024, i + 1));
      writeFileSync(join(bin, "notes.ts"), `v${i}\n`);
      git(bin, "add", ".");
      git(bin, "commit", "-q", "-m", `build ${i}`);
    }
    await watcher.scanNow(bin);
    const found = signals.slice(before).filter((s) => s.type === "commit_created");
    expect(found).toHaveLength(3);
    expect(found.every((s) => s.filesChanged === 2)).toBe(true);
    // Oldest first, so the dashboard receives them in order.
    expect(found.map((s) => s.occurredAt)).toEqual([...found.map((s) => s.occurredAt)].sort());
  });
});
