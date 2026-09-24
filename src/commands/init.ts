import { existsSync, mkdirSync } from "node:fs";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pc from "picocolors";

import { AjentifyError } from "../errors.js";

// Capture this module's directory in a format-agnostic way. esbuild (via
// tsup) rewrites `import.meta.url` in the CJS bundle to a __filename-based
// polyfill, so this expression is safe in both ESM and CJS output.
function getThisDir(): string {
  return dirname(fileURLToPath(import.meta.url));
}

/** Files copied verbatim into the target directory. */
const TEMPLATE_FILES = ["ajentify.json", "AGENTS.md", ".env.example"] as const;

/** Lines we ensure exist in `.gitignore` (under a `# ajentify` header). */
const GITIGNORE_ENTRIES = [".env", "AGENTS.md"];
const GITIGNORE_HEADER = "# ajentify";

export interface InitOptions {
  /** Directory to scaffold into. Defaults to `process.cwd()`. */
  cwd?: string;
  /** Overwrite an existing ajentify.json if present. */
  force?: boolean;
  /** Stream-like sink for user-facing logs. Defaults to console.log. */
  log?: (line: string) => void;
}

export async function init(options: InitOptions = {}): Promise<void> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const log = options.log ?? ((line: string) => console.log(line));

  const manifestPath = join(cwd, "ajentify.json");
  if (existsSync(manifestPath) && !options.force) {
    throw new AjentifyError(
      `ajentify.json already exists at ${manifestPath}. Re-run with --force to overwrite.`,
    );
  }

  const templatesDir = findTemplatesDir();

  mkdirSync(cwd, { recursive: true });
  for (const name of TEMPLATE_FILES) {
    const src = join(templatesDir, name);
    const dest = join(cwd, name);
    await copyFile(src, dest);
    log(pc.green(`  created ${rel(cwd, dest)}`));
  }

  const gitignoreChanges = await ensureGitignoreEntries(cwd, GITIGNORE_ENTRIES);
  if (gitignoreChanges.created) {
    log(pc.green(`  created ${rel(cwd, gitignoreChanges.path)}`));
  } else if (gitignoreChanges.added.length > 0) {
    log(
      pc.green(
        `  updated ${rel(cwd, gitignoreChanges.path)} (added ${gitignoreChanges.added.join(", ")})`,
      ),
    );
  } else {
    log(pc.dim(`  .gitignore already had ${GITIGNORE_ENTRIES.join(", ")}`));
  }

  log("");
  log(pc.bold("Next steps:"));
  log("  1. Copy .env.example to .env and set AJENTIFY_API_KEY.");
  log("  2. Read AGENTS.md (or point your coding agent at it) to learn the manifest shape.");
  log(`  3. Run ${pc.cyan("ajentify deploy <stage> --plan")} to preview, then drop --plan to apply.`);
}

// ---------- .gitignore handling ----------

export interface GitignoreUpdate {
  path: string;
  created: boolean;
  added: string[];
}

/**
 * Idempotently ensure each entry in `entries` exists in the cwd's `.gitignore`.
 * Creates the file if missing. Entries already present (line-exact, ignoring
 * trailing whitespace and outer blank lines) are left alone.
 */
export async function ensureGitignoreEntries(
  cwd: string,
  entries: string[],
): Promise<GitignoreUpdate> {
  const path = join(cwd, ".gitignore");
  if (!existsSync(path)) {
    const body = [GITIGNORE_HEADER, ...entries, ""].join("\n");
    await writeFile(path, body, "utf8");
    return { path, created: true, added: [...entries] };
  }

  const existing = await readFile(path, "utf8");
  const present = new Set(
    existing
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean),
  );
  const toAdd = entries.filter((e) => !present.has(e));
  if (toAdd.length === 0) {
    return { path, created: false, added: [] };
  }

  const sep = existing.endsWith("\n") ? "" : "\n";
  const headerLine = present.has(GITIGNORE_HEADER) ? "" : `${GITIGNORE_HEADER}\n`;
  const appended = `${sep}${headerLine}${toAdd.join("\n")}\n`;
  await writeFile(path, existing + appended, "utf8");
  return { path, created: false, added: toAdd };
}

// ---------- helpers ----------

function findTemplatesDir(): string {
  // After tsup build:    package_root/dist/cli.js  -> ../templates
  // During development:  package_root/src/commands/init.ts -> ../../templates
  const here = getThisDir();
  const candidates = [
    resolve(here, "..", "templates"),
    resolve(here, "..", "..", "templates"),
    resolve(here, "..", "..", "..", "templates"),
  ];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, "ajentify.json"))) return candidate;
  }
  throw new AjentifyError(
    `Could not locate package templates directory. Tried: ${candidates.join(", ")}`,
  );
}

function rel(base: string, p: string): string {
  if (p.startsWith(base + "/")) return p.slice(base.length + 1);
  return p;
}
