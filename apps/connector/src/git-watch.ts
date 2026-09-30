import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { uuidFromSeed } from "./os-utils.js";

/**
 * Commit → Verified → Shipped, observed locally.
 *
 * The connector learns which git repositories the AI agents work in (the
 * `cwd` of agent hook events) and watches them:
 *
 *   committed — a new commit whose author is this computer's git user
 *               (`git config user.email`, compared locally, never sent)
 *   verified  — a passing check ran in that repo in the 30 minutes before the
 *               commit (the repo's CI gate / pre-commit, or an agent-run
 *               test or build tool)
 *   shipped   — the commit is on a remote-tracking branch (it was pushed)
 *
 * Only counts leave the machine: files changed, lines added/deleted, and an
 * opaque salted reference that links "committed" to "shipped". Never the git
 * hash, message, author, branch, or any code.
 */

export interface CommitSignal {
  type: "commit_created" | "commit_pushed";
  /** Deterministic, so a restart or a second scan can never double count. */
  eventId: string;
  occurredAt: string;
  ref: string;
  repo: string;
  filesChanged?: number;
  linesAdded?: number;
  linesDeleted?: number;
  verified?: boolean;
}

interface RepoState {
  root: string;
  watchedSince: number;
  lastCheckAt?: number;
  /** git hash → our record. Hashes stay on this machine (0600 state file). */
  commits: Record<string, { ref: string; at: number; pushed: boolean }>;
  /** Hashes already sent as commit_created. Never cleared, so a rescan cannot double-send. */
  reported?: string[];
}

interface State {
  salt: string;
  repos: Record<string, RepoState>;
}

const VERIFY_WINDOW_MS = 30 * 60_000;
/** A newly seen repo reports this much of the git user's history (then live). */
const BACKFILL_MS = 14 * 86_400_000;
const TRACK_PUSH_FOR_MS = 14 * 86_400_000;
const SCAN_EVERY_MS = 30_000;
const OBSERVE_RESCAN_MS = 15_000;

/**
 * Files above this size are treated as binary without being read. Repos that
 * commit large build artefacts (installers, executables) otherwise make every
 * `--numstat` load each version of them — that took 12s+ and hit the timeout,
 * so no commit in the repo was ever reported.
 */
const BIG_FILE = "core.bigFileThreshold=1m";

/** `out` is "" and `error` says why when `ok` is false (no narrowing needed). */
interface GitResult {
  ok: boolean;
  out: string;
  error: string;
}

function runGit(cwd: string, args: string[], timeoutMs = 8_000): Promise<GitResult> {
  return new Promise((resolve) => {
    execFile(
      "git",
      ["-c", BIG_FILE, "-C", cwd, ...args],
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) =>
        resolve(
          err
            ? {
                ok: false,
                out: "",
                error: (err as { killed?: boolean }).killed ? `timed out after ${timeoutMs / 1000}s` : err.message.split("\n")[0],
              }
            : { ok: true, out: String(stdout), error: "" },
        ),
    );
  });
}

async function git(cwd: string, args: string[]): Promise<string | null> {
  const r = await runGit(cwd, args);
  return r.ok ? r.out : null;
}

/** Files and lines for one commit (numstat reports "-" for binary files). */
function countChanges(numstat: string): { files: number; added: number; deleted: number } {
  let files = 0;
  let added = 0;
  let deleted = 0;
  for (const line of numstat.split("\n")) {
    const [a, d] = line.split("\t");
    if (a === undefined || d === undefined || !line.trim()) continue;
    files++;
    added += Number(a) || 0;
    deleted += Number(d) || 0;
  }
  return { files, added, deleted };
}

export function createGitWatcher(options: {
  stateDir: string;
  emit: (signal: CommitSignal) => void;
  /** False while unpaired or paused: nothing is scanned or sent. */
  isActive: () => boolean;
  /** A repo could not be read (logged once per repo and message, never silent). */
  warn?: (message: string) => void;
}) {
  const warned = new Set<string>();
  const warnOnce = (root: string, message: string) => {
    const key = `${root}:${message}`;
    if (warned.has(key)) return;
    warned.add(key);
    options.warn?.(`git watch · ${basename(root)} · ${message}`);
  };
  const file = join(options.stateDir, "git-state.json");
  let state: State = { salt: randomBytes(16).toString("hex"), repos: {} };
  try {
    if (existsSync(file)) state = { ...state, ...(JSON.parse(readFileSync(file, "utf8")) as State) };
  } catch {
    /* unreadable: start fresh (event ids are deterministic, so no double counting) */
  }
  /** cwd → repo root. "Not a repo" answers expire, so a later `git init` is picked up. */
  const rootOf = new Map<string, { root: string | null; at: number }>();
  const NOT_A_REPO_TTL_MS = 10 * 60_000;
  /** One scan per repo at a time; a request during a scan queues one more pass. */
  const inflight = new Map<string, Promise<void>>();
  const rescan = new Set<string>();
  const pendingScan = new Map<string, ReturnType<typeof setTimeout>>();

  function save(): void {
    mkdirSync(options.stateDir, { recursive: true, mode: 0o700 });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(state), { mode: 0o600 });
    renameSync(tmp, file);
  }

  async function resolveRoot(cwd: string | undefined): Promise<string | null> {
    if (!cwd) return null;
    const cached = rootOf.get(cwd);
    if (cached && (cached.root || Date.now() - cached.at < NOT_A_REPO_TTL_MS)) return cached.root;
    const out = await git(cwd, ["rev-parse", "--show-toplevel"]);
    const root = out?.trim() || null;
    rootOf.set(cwd, { root, at: Date.now() });
    return root;
  }

  async function repoFor(cwd: string | undefined): Promise<RepoState | null> {
    const root = await resolveRoot(cwd);
    if (!root) return null;
    if (!state.repos[root]) {
      // Pick up the git user's recent commits from git itself (the connector
      // may have been missing or outdated when they were made), then go live.
      state.repos[root] = { root, watchedSince: Date.now() - BACKFILL_MS, commits: {} };
      save();
    }
    return state.repos[root];
  }

  function refOf(root: string, hash: string): string {
    return createHash("sha256").update(`${state.salt}:${root}:${hash}`).digest("hex").slice(0, 32);
  }

  /**
   * Scan a repo. If a scan is already running (e.g. the observe() rescan when
   * the post-commit hook fires), run once more after it, and resolve when that
   * pass is done — so a just-made commit is never skipped until the next timer.
   */
  function scan(repo: RepoState): Promise<void> {
    if (!options.isActive()) return Promise.resolve();
    const running = inflight.get(repo.root);
    if (running) {
      rescan.add(repo.root);
      return running;
    }
    const pass = (async () => {
      do {
        rescan.delete(repo.root);
        await scanOnce(repo);
      } while (rescan.has(repo.root) && options.isActive());
    })().finally(() => inflight.delete(repo.root));
    inflight.set(repo.root, pass);
    return pass;
  }

  async function scanOnce(repo: RepoState): Promise<void> {
    // Only the last 14 days. A watchedSince of 0 used to scan the whole history,
    // then drop those commits and report them again on every pass.
    const sinceMs = Date.now() - BACKFILL_MS;
    const reported = new Set(repo.reported ?? []);
    const email = (await git(repo.root, ["config", "user.email"]))?.trim().toLowerCase();
    if (!email) warnOnce(repo.root, "no git user.email configured — commits cannot be attributed");
    // List first (cheap, no diffs); count files/lines only for commits not seen yet.
    const listed = email
      ? await runGit(repo.root, ["log", "-n", "300", `--since=@${Math.floor(sinceMs / 1000)}`, "--format=%H%x09%ct%x09%ae"])
      : null;
    if (listed && !listed.ok) warnOnce(repo.root, `could not list commits: ${listed.error}`);
    let changed = false;
    // git lists newest first; report oldest first so the dashboard reads in order.
    for (const line of (listed?.out ?? "").split("\n").filter(Boolean).reverse()) {
      const [rawHash, ct, author] = line.split("\t");
      const hash = rawHash?.trim();
      if (!hash || !ct || author?.trim().toLowerCase() !== email) continue; // pulled commits by others
      if (repo.commits[hash] || reported.has(hash)) continue;
      const at = Number(ct) * 1000;
      if (at < Math.floor(sinceMs / 1000) * 1000) continue; // git times are whole seconds
      const stat = await runGit(repo.root, ["show", "--format=", "--numstat", hash], 15_000);
      if (!stat.ok) {
        warnOnce(repo.root, `could not read commit stats: ${stat.error}`);
        continue; // retried on the next scan
      }
      const { files, added, deleted } = countChanges(stat.out);
      const ref = refOf(repo.root, hash);
      // Unknowable for commits made before we watched: reported as not verified, never guessed.
      const verified = repo.lastCheckAt != null && repo.lastCheckAt >= at - VERIFY_WINDOW_MS && repo.lastCheckAt <= at + 120_000;
      repo.commits[hash] = { ref, at, pushed: false };
      reported.add(hash);
      changed = true;
      options.emit({
        type: "commit_created",
        eventId: uuidFromSeed(`commit_created:${ref}`),
        occurredAt: new Date(at).toISOString(),
        ref,
        repo: basename(repo.root).slice(0, 64),
        filesChanged: files,
        linesAdded: added,
        linesDeleted: deleted,
        verified,
      });
    }
    if (changed) {
      repo.reported = [...reported].slice(-400);
      save();
    }
    // Shipped: the commit is now on a remote-tracking branch.
    for (const [hash, c] of Object.entries(repo.commits)) {
      if (c.pushed) continue;
      if (Date.now() - c.at > TRACK_PUSH_FOR_MS) {
        delete repo.commits[hash];
        changed = true;
        continue;
      }
      const remotes = await git(repo.root, ["branch", "-r", "--contains", hash]);
      if (remotes && remotes.trim()) {
        c.pushed = true;
        changed = true;
        options.emit({
          type: "commit_pushed",
          eventId: uuidFromSeed(`commit_pushed:${c.ref}`),
          occurredAt: new Date().toISOString(),
          ref: c.ref,
          repo: basename(repo.root).slice(0, 64),
        });
      }
    }
    // Keep the state file small: forget shipped commits after the push window.
    for (const [hash, c] of Object.entries(repo.commits)) {
      if (c.pushed && Date.now() - c.at > TRACK_PUSH_FOR_MS) {
        delete repo.commits[hash];
        changed = true;
      }
    }
    if (changed) save();
  }

  function scheduleScan(repo: RepoState, delayMs: number): void {
    const existing = pendingScan.get(repo.root);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      pendingScan.delete(repo.root);
      scan(repo).catch(() => undefined);
    }, delayMs);
    t.unref?.();
    pendingScan.set(repo.root, t);
  }

  return {
    /** An agent worked in `cwd`: watch that repo; scan now and again soon (user may commit right after). */
    async observe(cwd: string | undefined): Promise<void> {
      const repo = await repoFor(cwd);
      if (!repo) return;
      scan(repo).catch(() => undefined);
      scheduleScan(repo, OBSERVE_RESCAN_MS);
    },
    /** A passing check ran in `cwd` (CI gate / pre-commit, agent test or build). */
    async markCheck(cwd: string | undefined): Promise<void> {
      const repo = await repoFor(cwd);
      if (!repo) return;
      repo.lastCheckAt = Date.now();
      save();
    },
    /** Post-commit hook: scan that repo right away. */
    async scanNow(cwd: string | undefined): Promise<void> {
      const repo = await repoFor(cwd);
      if (repo) await scan(repo);
    },
    start(): void {
      const t = setInterval(() => {
        for (const repo of Object.values(state.repos)) {
          // A deleted or moved repository would otherwise be scanned (two git
          // processes every 30 s) forever.
          if (!existsSync(repo.root)) {
            delete state.repos[repo.root];
            try {
              save();
            } catch {
              /* best effort; retried next tick */
            }
            continue;
          }
          scan(repo).catch(() => undefined);
        }
      }, SCAN_EVERY_MS);
      t.unref?.();
    },
  };
}
