import { promises as fs } from "fs";
import * as path from "path";
import { CursorSubAgentInfo } from "../types";

/**
 * Discovers Cursor sub-agent persona files (`.cursor/agents/*.md`) in the
 * current workspace. These are plain markdown files with a small YAML-style
 * frontmatter block (`name:`, `description:`) used by Cursor to route work
 * to specialized personas. BranchBoard reads them so the user can attach one
 * or more personas to a task — their content is then folded into the
 * generated AI prompt (see AIAgentService.buildPrompt).
 *
 * No YAML library is used: the project intentionally has zero runtime
 * dependencies, and the frontmatter Cursor writes is a flat `key: value`
 * list, so a small hand-rolled parser is simpler and more reliable here
 * than pulling in a parser for a format we only need a sliver of.
 */
export class CursorAgentsService {
  private cache: { agents: CursorSubAgentInfo[]; loadedAt: number } | undefined;
  private readonly cacheTtlMs = 5_000;

  constructor(private readonly cwd: string) {}

  private get agentsDir(): string {
    return path.join(this.cwd, ".cursor", "agents");
  }

  /** Invalidate the in-memory cache, e.g. after the user explicitly refreshes the picker. */
  invalidate(): void {
    this.cache = undefined;
  }

  /** List every discovered persona, sorted by name. Never throws. */
  async listAgents(): Promise<CursorSubAgentInfo[]> {
    if (this.cache && Date.now() - this.cache.loadedAt < this.cacheTtlMs) {
      return this.cache.agents;
    }
    const agents = await this.scan();
    agents.sort((a, b) => a.name.localeCompare(b.name));
    this.cache = { agents, loadedAt: Date.now() };
    return agents;
  }

  /** Resolve a set of previously selected agent ids back to full persona info, dropping any that no longer exist. */
  async getAgentsByIds(ids: string[]): Promise<CursorSubAgentInfo[]> {
    if (!ids || ids.length === 0) {
      return [];
    }
    const wanted = new Set(ids);
    const all = await this.listAgents();
    return all.filter((agent) => wanted.has(agent.id));
  }

  private async scan(): Promise<CursorSubAgentInfo[]> {
    let entries: string[];
    try {
      const dirEntries = await fs.readdir(this.agentsDir, { withFileTypes: true });
      entries = dirEntries.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md")).map((entry) => entry.name);
    } catch {
      // Directory doesn't exist (no Cursor personas in this workspace) — not an error.
      return [];
    }

    const results: CursorSubAgentInfo[] = [];
    for (const fileName of entries) {
      const filePath = path.join(this.agentsDir, fileName);
      try {
        const [raw, stat] = await Promise.all([fs.readFile(filePath, "utf8"), fs.stat(filePath)]);
        results.push(this.parseAgentFile(fileName, filePath, raw, stat.mtime.toISOString()));
      } catch {
        // Unreadable file — skip it rather than failing the whole scan.
      }
    }
    return results;
  }

  /**
   * Parses one persona file. Expected shape (matches Cursor's convention):
   *
   *   ---
   *   name: JavaScript Core Senior
   *   description: Senior JS/frontend specialist
   *   ---
   *   # ZASADY PRACY
   *   ...
   *   # TRIGGERY
   *   - Pliki *.js
   *   - Zapytania: "napisz JS", "logika frontend"
   */
  private parseAgentFile(fileName: string, filePath: string, raw: string, updatedAt: string): CursorSubAgentInfo {
    const { frontmatter, body } = this.splitFrontmatter(raw);
    const name = frontmatter.name?.trim() || this.fileNameToTitle(fileName);
    const description = frontmatter.description?.trim() || "";
    const fileTriggers = this.extractFileTriggers(body);
    const keywordTriggers = this.extractKeywordTriggers(body);
    return {
      id: path.relative(this.cwd, filePath).split(path.sep).join("/"),
      filePath,
      name,
      description,
      body: body.trim(),
      fileTriggers,
      keywordTriggers,
      updatedAt,
    };
  }

  private fileNameToTitle(fileName: string): string {
    return fileName
      .replace(/\.md$/i, "")
      .split(/[-_]/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  /** Splits a leading `---\n...\n---` YAML-ish block from the rest of the markdown body. */
  private splitFrontmatter(raw: string): { frontmatter: Record<string, string>; body: string } {
    const text = raw.replace(/\r\n/g, "\n");
    if (!text.startsWith("---")) {
      return { frontmatter: {}, body: text };
    }
    const closeIndex = text.indexOf("\n---", 3);
    if (closeIndex === -1) {
      return { frontmatter: {}, body: text };
    }
    const block = text.slice(3, closeIndex).trim();
    const body = text.slice(closeIndex + 4).replace(/^\n/, "");
    const frontmatter: Record<string, string> = {};
    let currentKey: string | null = null;
    for (const line of block.split("\n")) {
      const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
      if (match) {
        currentKey = match[1].trim();
        frontmatter[currentKey] = this.unquote(match[2].trim());
      } else if (currentKey && /^\s+\S/.test(line)) {
        // Continuation line for a multi-line value.
        frontmatter[currentKey] = `${frontmatter[currentKey]} ${line.trim()}`.trim();
      }
    }
    return { frontmatter, body };
  }

  private unquote(value: string): string {
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1);
    }
    return value;
  }

  /** Extracts `*.ext`-style glob patterns mentioned anywhere in the body, e.g. "Pliki *.js, *.ts". */
  private extractFileTriggers(body: string): string[] {
    const matches = body.match(/\*\.[A-Za-z0-9]+/g) ?? [];
    return Array.from(new Set(matches.map((m) => m.toLowerCase())));
  }

  /**
   * Extracts free-text query triggers from a "TRIGGERY" section, e.g. lines like:
   *   - Zapytania: "napisz JS", "logika frontend", "obsługa eventów".
   * Falls back to an empty list when no such section exists.
   */
  private extractKeywordTriggers(body: string): string[] {
    const sectionMatch = /#+\s*TRIGGERY[^\n]*\n([\s\S]*?)(?=\n#+\s|$)/i.exec(body);
    const section = sectionMatch ? sectionMatch[1] : body;
    const quoted = section.match(/"([^"]+)"/g) ?? [];
    return Array.from(new Set(quoted.map((q) => q.slice(1, -1).trim()).filter(Boolean)));
  }
}
