export type ToolCategory =
  | "file_read"
  | "file_write"
  | "shell"
  | "search"
  | "test"
  | "build"
  | "browser"
  | "other";

export function inferToolCategory(toolName: string): ToolCategory {
  const n = toolName.toLowerCase();
  if (n.includes("browser")) return "browser";
  if (
    n.includes("read") || n.includes("glob") || n.includes("grep") ||
    n.includes("view_file") || n.includes("list_dir") || n.includes("find_by_name") ||
    n === "view" || n === "ls"
  ) {
    return "file_read";
  }
  if (
    n.includes("write") || n.includes("edit") || n.includes("patch") || n.includes("replace") ||
    // Copilot "create" / VS Code "createFile"; not MCP tools such as create_issue.
    n === "create" || n.includes("createfile") || n.includes("create_file")
  ) {
    return "file_write";
  }
  if (
    n.includes("bash") || n.includes("shell") || n.includes("terminal") ||
    n.includes("run_command") || n.includes("command_status") ||
    // Devin CLI "exec", Codex "exec_command".
    n === "exec" || n.startsWith("exec_")
  ) {
    return "shell";
  }
  if (n.includes("search") || n.includes("web")) return "search";
  if (n.includes("test")) return "test";
  if (n.includes("build")) return "build";
  if (n.includes("browser")) return "browser";
  return "other";
}
