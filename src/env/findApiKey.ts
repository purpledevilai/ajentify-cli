import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { AjentifyError } from "../errors.js";

export interface FindApiKeyOptions {
  /** Directory to start walking up from. Usually the manifest's directory. */
  startDir: string;
  /** Process env to consult first (defaults to `process.env`). */
  env?: NodeJS.ProcessEnv;
}

/**
 * Resolve `AJENTIFY_API_KEY` from:
 *   1. `process.env.AJENTIFY_API_KEY` (whether exported or injected by the
 *      calling shell / CI), then
 *   2. The nearest `.env` file walking up from `startDir`.
 *
 * Mirrors the algorithm used by the Python prototype's `get_api_key`.
 * Throws an `AjentifyError` if not found anywhere.
 */
export function findApiKey(options: FindApiKeyOptions): string {
  const env = options.env ?? process.env;

  const fromProcess = env["AJENTIFY_API_KEY"];
  if (fromProcess && fromProcess.length > 0) return fromProcess;

  const dotenv = findDotenv(options.startDir);
  if (dotenv) {
    const values = parseDotenv(readFileSync(dotenv, "utf8"));
    const key = values["AJENTIFY_API_KEY"];
    if (key && key.length > 0) return key;
  }

  throw new AjentifyError(
    "AJENTIFY_API_KEY is not set. Add it to .env or export it before running.",
  );
}

/**
 * Walk up from `startDir` looking for a `.env` file. Returns the absolute
 * path of the first match, or undefined if none was found before the
 * filesystem root.
 */
export function findDotenv(startDir: string): string | undefined {
  let dir = resolve(startDir);
  // Cap iterations defensively; filesystem traversal eventually hits "/".
  for (let i = 0; i < 256; i++) {
    const candidate = join(dir, ".env");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
  return undefined;
}

/**
 * Minimal `.env` parser matching the Python prototype's behaviour:
 *   - `KEY=VALUE` per line
 *   - lines starting with `#` are comments
 *   - whitespace around the key / value is trimmed
 *   - matching outer quotes (' or ") around the value are stripped
 *   - lines without `=` are ignored
 *
 * No interpolation, no multiline values, no `export` keyword. Intentionally
 * tiny so we don't take a runtime dep on `dotenv`.
 */
export function parseDotenv(source: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const eq = line.indexOf("=");
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      val.length >= 2 &&
      val[0] === val[val.length - 1] &&
      (val[0] === "'" || val[0] === '"')
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}
