import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { AjentifyError } from "../errors.js";
import type { ManifestOnDisk } from "./types.js";

export interface LoadedManifest {
  /** Absolute path to the manifest file. */
  path: string;
  /** Absolute directory containing the manifest. All file refs resolve relative to this. */
  dir: string;
  /** Parsed JSON as the on-disk shape. */
  manifest: ManifestOnDisk;
}

/**
 * Read and parse an ajentify.json from disk.
 *
 * Errors are wrapped in {@link AjentifyError} with a one-line message that
 * includes the file path (and the line/col when the parse error provides it
 * via the standard `JSON.parse` "position N (line N column N)" wording).
 */
export async function loadManifest(manifestPath: string): Promise<LoadedManifest> {
  const absPath = resolve(manifestPath);

  let raw: string;
  try {
    raw = await readFile(absPath, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new AjentifyError(`Manifest not found: ${absPath}`);
    }
    throw new AjentifyError(`Failed to read manifest ${absPath}: ${(err as Error).message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    // V8's SyntaxError messages already include "at position N (line N column N)";
    // surface them as-is so editors / users can jump to the offending location.
    throw new AjentifyError(`Failed to parse ${absPath}: ${(err as Error).message}`);
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new AjentifyError(`Manifest at ${absPath} must be a JSON object, got ${describe(parsed)}`);
  }

  return {
    path: absPath,
    dir: resolve(absPath, ".."),
    manifest: parsed as ManifestOnDisk,
  };
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}
