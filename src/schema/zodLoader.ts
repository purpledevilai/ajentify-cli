import { isAbsolute, join, resolve } from "node:path";

import { AjentifyError } from "../errors.js";
import type { JsonSchema } from "../manifest/types.js";

/**
 * Load a Zod schema from a TypeScript/JavaScript file and convert it to a
 * JSON Schema (Draft 2020-12). Used by the manifest resolver to inline
 * `input_schema_file` / `output_schema_file` references.
 *
 * `schemaRef` accepts a path with an optional `#ExportName` fragment:
 *   - "schemas/sortItem.ts"                     -> default export
 *   - "schemas/sortItem.ts#SortItemInput"       -> named export
 *
 * The Zod version installed in the consumer project determines the conversion:
 *   - Zod v4: uses the built-in `z.toJSONSchema`.
 *   - Zod v3: falls back to the optional `zod-to-json-schema` peer dependency.
 *
 * The CLI itself only takes `zod` as a peer dep, so the user's installed
 * version is the one whose `.parse`/instanceof checks the schema satisfies.
 */
export async function loadZodSchemaAsJsonSchema(
  schemaRef: string,
  baseDir: string,
  context?: string,
): Promise<JsonSchema> {
  const { filePath, exportName } = parseSchemaRef(schemaRef);
  const absFile = isAbsolute(filePath) ? filePath : resolve(baseDir, filePath);

  const where = context ? ` (referenced from ${context})` : "";

  const mod = await importModule(absFile, where);
  const exported = pickExport(mod, exportName, absFile, where);
  if (!isZodSchema(exported)) {
    throw new AjentifyError(
      `Export ${exportName ?? "default"} from ${absFile}${where} is not a Zod schema (got ${describe(exported)}).`,
    );
  }

  return await convertToJsonSchema(exported, absFile, exportName, where);
}

// ---------- ref parsing ----------

interface ParsedRef {
  filePath: string;
  exportName: string | undefined;
}

export function parseSchemaRef(ref: string): ParsedRef {
  const hash = ref.indexOf("#");
  if (hash === -1) {
    return { filePath: ref, exportName: undefined };
  }
  const filePath = ref.slice(0, hash);
  const exportName = ref.slice(hash + 1);
  if (!filePath) {
    throw new AjentifyError(`Schema reference '${ref}' is missing a file path before '#'.`);
  }
  if (!exportName) {
    throw new AjentifyError(`Schema reference '${ref}' has an empty export name after '#'.`);
  }
  return { filePath, exportName };
}

// ---------- module loading ----------

let cachedJiti: ((path: string) => unknown) | undefined;

async function getJiti(): Promise<(path: string) => unknown> {
  if (cachedJiti) return cachedJiti;
  const mod = (await import("jiti")) as unknown as {
    default?: (typeof import("jiti"))["default"];
  } & typeof import("jiti");
  // jiti v2 exports a factory: `createJiti(filename, options?)`.
  // It's also the default export, but tsup-built CJS interop can mean either
  // shape — accept both.
  const factory: any = mod.createJiti ?? mod.default ?? mod;
  // jiti uses the parent path only as an anchor for relative resolution / its
  // internal cache. We always pass absolute paths to .import, so anchoring at
  // process.cwd() is fine and keeps this code format-agnostic (avoids
  // import.meta in the CJS bundle).
  //
  // interopDefault is left OFF: with it ON, jiti wraps a CJS module's default
  // export in a `bound default` function that drops the original methods —
  // fatal for Zod schemas. We pick the export manually below.
  const j = factory(join(process.cwd(), "__ajentify__.js"), {
    interopDefault: false,
    moduleCache: false,
  });
  // jiti v2's instance is a callable with .import(); v1 is just a function.
  cachedJiti = (path: string) => (typeof j.import === "function" ? j.import(path) : j(path));
  return cachedJiti;
}

async function importModule(absFile: string, where: string): Promise<Record<string, unknown>> {
  const jiti = await getJiti();
  let raw: unknown;
  try {
    raw = await Promise.resolve(jiti(absFile));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || (err as Error).message.includes("Cannot find")) {
      throw new AjentifyError(`Schema file not found: ${absFile}${where}`);
    }
    throw new AjentifyError(
      `Failed to load schema file ${absFile}${where}: ${(err as Error).message}`,
    );
  }
  if (raw === null || typeof raw !== "object") {
    throw new AjentifyError(
      `Schema file ${absFile}${where} did not return a module (got ${describe(raw)}).`,
    );
  }
  return raw as Record<string, unknown>;
}

function pickExport(
  mod: Record<string, unknown>,
  exportName: string | undefined,
  absFile: string,
  where: string,
): unknown {
  if (exportName === undefined) {
    if ("default" in mod) return mod.default;
    // Some loaders (esbuild, jiti with interopDefault) expose a default-less
    // module's namespace where the file's `export default` becomes a plain
    // export. If there's exactly one non-default export, accept it; otherwise
    // tell the user to pick one explicitly.
    const names = Object.keys(mod);
    if (names.length === 1 && names[0]) return mod[names[0]];
    throw new AjentifyError(
      `Schema file ${absFile}${where} has no default export. Available named exports: ${names.join(", ") || "(none)"}. ` +
        `Use the '#ExportName' fragment to pick one (e.g. "${absFile}#${names[0] ?? "MySchema"}").`,
    );
  }
  if (!(exportName in mod)) {
    const names = Object.keys(mod).filter((n) => n !== "default");
    throw new AjentifyError(
      `Schema file ${absFile}${where} has no export named '${exportName}'. ` +
        `Available exports: ${names.join(", ") || "(none)"}.`,
    );
  }
  return mod[exportName];
}

// ---------- Zod detection + conversion ----------

interface ZodLike {
  /** Zod v4: every schema instance has `_zod.def` (internal) and the static z.toJSONSchema. */
  _def?: unknown;
  /** v3+v4 both have this on instances. */
  parse?: unknown;
  safeParse?: unknown;
  _zod?: unknown;
}

function isZodSchema(value: unknown): value is ZodLike {
  // Zod v4 schemas are *callable* (typeof === "function") with parse/safeParse
  // attached as properties; Zod v3 schemas are plain objects. Accept both.
  if (value === null) return false;
  if (typeof value !== "object" && typeof value !== "function") return false;
  const v = value as ZodLike;
  return (
    typeof v.parse === "function" &&
    typeof v.safeParse === "function" &&
    (v._def !== undefined || v._zod !== undefined)
  );
}

async function convertToJsonSchema(
  schema: ZodLike,
  absFile: string,
  exportName: string | undefined,
  where: string,
): Promise<JsonSchema> {
  // Prefer Zod v4's built-in: `import { z } from "zod"; z.toJSONSchema(schema)`.
  // We dynamically import zod from the consumer's project (peer dep) so the
  // function instance matches the schema instance.
  try {
    const zodPkg = (await import("zod")) as unknown as {
      z?: { toJSONSchema?: (s: unknown, opts?: unknown) => JsonSchema };
      toJSONSchema?: (s: unknown, opts?: unknown) => JsonSchema;
    };
    const toJsonSchema = zodPkg.z?.toJSONSchema ?? zodPkg.toJSONSchema;
    if (typeof toJsonSchema === "function") {
      const result = toJsonSchema(schema, {
        target: "draft-2020-12",
        // The server's reconciler accepts whatever the schema declares; we don't
        // need to strip `$schema` because the server treats the whole payload as
        // a private parameter definition.
      });
      return normalizeSchema(result);
    }
  } catch {
    // fall through to v3 path
  }

  // Zod v3 path: optional dep.
  try {
    const { zodToJsonSchema } = (await import("zod-to-json-schema")) as {
      zodToJsonSchema: (schema: unknown, opts?: unknown) => JsonSchema;
    };
    const result = zodToJsonSchema(schema, { target: "jsonSchema2019-09" });
    return normalizeSchema(result);
  } catch (err) {
    const ref = `${absFile}${exportName ? `#${exportName}` : ""}`;
    throw new AjentifyError(
      `Could not convert Zod schema ${ref}${where} to JSON Schema. ` +
        `Install zod >=4 (preferred) or the 'zod-to-json-schema' package for Zod v3. ` +
        `Underlying error: ${(err as Error).message}`,
    );
  }
}

function normalizeSchema(schema: JsonSchema): JsonSchema {
  // zod-to-json-schema wraps the schema in an outer { $ref, definitions: { ... } }
  // when there are nested refs. The server stores schemas verbatim, so prefer the
  // inlined form when we can produce one. If the outer shape isn't that pattern,
  // just return as-is.
  if (
    typeof schema === "object" &&
    schema !== null &&
    typeof (schema as Record<string, unknown>).$ref === "string"
  ) {
    return schema;
  }
  return schema;
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}
