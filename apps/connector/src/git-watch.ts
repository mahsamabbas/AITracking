import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

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

function git(cwd: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile("git", ["-C", cwd, ...args], { timeout: 8_000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) =>
      resolve(err ? null : String(stdout)),
    );
  });
}

function uuidFrom(seed: string): string {
  const h = createHash("sha256").update(seed).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export function createGitWatcher(options: {
  stateDir: string;
  emit: (signal: CommitSignal) => void;
  /** False while unpaired or paused: nothing is scanned or sent. */
  isActive: () => boolean;
}) {
  const file = join(options.stateDir, "git-state.json");
  let state: State = { salt: randomBytes(16).toString("hex"), repos: {} };
  try {
    if (existsSync(file)) state = { ...state, ...(JSON.parse(readFileSync(file, "utf8")) as State) };
  } catch {
    /* unreadable: start fresh (event ids are deterministic, so no double counting) */
  }
  const rootOf = new Map<string, string | null>();
  const scanning = new Set<string>();
  const pendingScan = new Map<string, ReturnType<typeof setTimeout>>();

  function save(): void {
    mkdirSync(options.stateDir, { recursive: true, mode: 0o700 });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(state), { mode: 0o600 });
    renameSync(tmp, file);
  }

  async function resolveRoot(cwd: string | undefined): Promise<string | null> {
    if (!cwd) return null;
    if (rootOf.has(cwd)) return rootOf.get(cwd) ?? null;
    const out = await git(cwd, ["rev-parse", "--show-toplevel"]);
    const root = out?.trim() || null;
    rootOf.set(cwd, root);
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

  async function scan(repo: RepoState): Promise<void> {
    if (!options.isActive() || scanning.has(repo.root)) return;
    scanning.add(repo.root);
    try {
      // Always look back BACKFILL_MS, even for repos first seen by an older
      // build that stored "from now": commits made while the connector was
      // missing/outdated are still read from git. Event ids are deterministic,
      // so re-reading a commit never counts it twice.
      const sinceMs = Math.min(repo.watchedSince, Date.now() - BACKFILL_MS);
      const email = (await git(repo.root, ["config", "user.email"]))?.trim().toLowerCase();
      const log = email
        ? await git(repo.root, [
            "log",
            "-n",
            "300",
            `--since=@${Math.floor(sinceMs / 1000)}`,
            "--format=@@%H%x09%ct%x09%ae",
            "--numstat",
          ])
        : null;
      let changed = false;
      for (const block of (log ?? "").split("@@").filter(Boolean)) {
        const [head, ...rest] = block.split("\n");
        const [hash, ct, author] = head.split("\t");
        if (!hash || !ct || author?.trim().toLowerCase() !== email) continue; // pulled commits by others
        if (repo.commits[hash]) continue;
        const at = Number(ct) * 1000;
        if (at < Math.floor(sinceMs / 1000) * 1000) continue; // git times are whole seconds
        let files = 0;
        let added = 0;
        let deleted = 0;
        for (const line of rest) {
          const [a, d] = line.split("\t");
          if (a === undefined || d === undefined || !line.trim()) continue;
          files++;
          added += Number(a) || 0; // "-" for binary files
          deleted += Number(d) || 0;
        }
        const ref = refOf(repo.root, hash);
        // Unknowable for commits made before we watched: reported as not verified, never guessed.
        const verified = repo.lastCheckAt != null && repo.lastCheckAt >= at - VERIFY_WINDOW_MS && repo.lastCheckAt <= at + 120_000;
        repo.commits[hash] = { ref, at, pushed: false };
        changed = true;
        options.emit({
          type: "commit_created",
          eventId: uuidFrom(`commit_created:${ref}`),
          occurredAt: new Date(at).toISOString(),
          ref,
          repo: basename(repo.root).slice(0, 64),
          filesChanged: files,
          linesAdded: added,
          linesDeleted: deleted,
          verified,
        });
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
            eventId: uuidFrom(`commit_pushed:${c.ref}`),
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
    } finally {
      scanning.delete(repo.root);
    }
  }

  function scheduleScan(repo: RepoState, delayMs: number): void {
    const existing = pendingScan.get(repo.root);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      pendingScan.delete(repo.root);
      void scan(repo);
    }, delayMs);
    t.unref?.();
    pendingScan.set(repo.root, t);
  }

  return {
    /** An agent worked in `cwd`: watch that repo; scan now and again soon (user may commit right after). */
    async observe(cwd: string | undefined): Promise<void> {
      const repo = await repoFor(cwd);
      if (!repo) return;
      void scan(repo);
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
        for (const repo of Object.values(state.repos)) void scan(repo);
      }, SCAN_EVERY_MS);
      t.unref?.();
    },
  };
}
