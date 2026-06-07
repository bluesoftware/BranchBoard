/**
 * Helpers for safe, reversible git operations. Naming + rollback command
 * generation live here so they are consistent across the finish flow and the
 * manual "Safety" actions in the task drawer.
 *
 * IMPORTANT: this module never executes destructive commands. It only creates
 * non-destructive safety nets (tags / backup branches) via GitService, and it
 * GENERATES rollback command text for the user to review and run themselves.
 */
export class SafetyService {
  /** Compact local timestamp suffix: yyyymmdd-hhmmss. */
  static timestamp(d = new Date()): string {
    const p = (n: number) => String(n).padStart(2, "0");
    return (
      `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
      `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
    );
  }

  static backupBranchName(branch: string, d = new Date()): string {
    return `backup/${branch}-${SafetyService.timestamp(d)}`;
  }

  static archiveTagName(branch: string, d = new Date()): string {
    return `archive/${branch}-${SafetyService.timestamp(d)}`;
  }

  static safetyTagName(taskId: string, d = new Date()): string {
    const id = (taskId || "task").replace(/[^a-zA-Z0-9_-]/g, "").slice(-8) || "task";
    return `before-merge-${id}-${SafetyService.timestamp(d)}`;
  }

  /**
   * Rollback commands the user can review and run. Ordered safest-first; the
   * destructive ones are clearly marked. Never run automatically.
   */
  static rollbackCommands(branch: string, mainBranch: string, backupBranch?: string): string[] {
    const lines: string[] = [
      `# Safe undo of the last commit (creates a new commit):`,
      `git switch ${branch}`,
      `git revert --no-edit HEAD`,
      ``,
      `# Inspect history / find a previous good state:`,
      `git log --oneline -n 20`,
      `git reflog`,
      ``,
    ];
    if (backupBranch) {
      lines.push(
        `# Restore this branch from its backup:`,
        `git switch -c restore/${branch} ${backupBranch}`,
        ``
      );
    }
    lines.push(
      `# DANGER — rewrites history, discards local commits:`,
      `# git reset --hard origin/${branch}`,
      `# git reset --hard HEAD~1`,
      ``,
      `# Undo a bad merge on ${mainBranch} (creates a revert commit):`,
      `# git switch ${mainBranch} && git revert --no-edit -m 1 <merge-commit>`
    );
    return lines;
  }
}
