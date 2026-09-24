import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

import { AjentifyError } from "../errors.js";
import { loadZodSchemaAsJsonSchema } from "../schema/zodLoader.js";
import type {
  AgentOnDisk,
  AgentWire,
  ManifestOnDisk,
  ManifestWire,
  SREOnDisk,
  SREWire,
  ToolOnDisk,
  ToolWire,
} from "./types.js";

export interface ResolveOptions {
  /** Absolute directory that all relative file refs resolve against. */
  baseDir: string;
}

/**
 * Convert an on-disk manifest (with `*_file` reference fields) into the
 * exact wire shape the server's `POST /deploy` accepts.
 *
 * Mirrors the inlining behaviour of the Python prototype's
 * `inline_file_references` (see ReBinProject/pod-backend/ajentify/deploy.py)
 * and extends it with:
 *   - `input_schema_file` / `output_schema_file` (Zod -> JSON Schema)
 *   - `prompt_template_file` (text inline for SREs)
 *   - The `#ExportName` fragment on schema refs.
 *
 * Conflicts (both inline and `*_file` form set on the same resource for the
 * same field) are hard errors.
 */
export async function resolveManifest(
  manifest: ManifestOnDisk,
  options: ResolveOptions,
): Promise<ManifestWire> {
  const baseDir = options.baseDir;

  const out: ManifestWire = {};

  if (manifest.tools) {
    out.tools = {};
    for (const [logical, tool] of Object.entries(manifest.tools)) {
      out.tools[logical] = await resolveTool(logical, tool, baseDir);
    }
  }

  if (manifest.sres) {
    out.sres = {};
    for (const [logical, sre] of Object.entries(manifest.sres)) {
      out.sres[logical] = await resolveSRE(logical, sre, baseDir);
    }
  }

  if (manifest.agents) {
    out.agents = {};
    for (const [logical, agent] of Object.entries(manifest.agents)) {
      out.agents[logical] = await resolveAgent(logical, agent, baseDir);
    }
  }

  return out;
}

// ---------- per-resource ----------

async function resolveTool(
  logical: string,
  tool: ToolOnDisk,
  baseDir: string,
): Promise<ToolWire> {
  const code = await resolveCode(logical, tool, baseDir);
  const input_schema = await resolveToolInputSchema(logical, tool, baseDir);

  // Build the wire object by copying allowed fields and the resolved ones.
  const wire: ToolWire = {
    name: tool.name,
  };
  if (tool.description !== undefined) wire.description = tool.description;
  if (input_schema !== undefined) wire.input_schema = input_schema;
  if (code !== undefined) wire.code = code;
  if (tool.pass_context !== undefined) wire.pass_context = tool.pass_context;
  if (tool.is_async !== undefined) wire.is_async = tool.is_async;
  if (tool.is_client_side_tool !== undefined) wire.is_client_side_tool = tool.is_client_side_tool;
  return wire;
}

async function resolveSRE(
  logical: string,
  sre: SREOnDisk,
  baseDir: string,
): Promise<SREWire> {
  const output_schema = await resolveSREOutputSchema(logical, sre, baseDir);
  const prompt_template = await resolveSREPromptTemplate(logical, sre, baseDir);

  const wire: SREWire = {
    name: sre.name,
    output_schema,
    prompt_template,
  };
  if (sre.description !== undefined) wire.description = sre.description;
  if (sre.is_public !== undefined) wire.is_public = sre.is_public;
  if (sre.variable_names !== undefined) wire.variable_names = sre.variable_names;
  if (sre.model_id !== undefined) wire.model_id = sre.model_id;
  return wire;
}

async function resolveAgent(
  logical: string,
  agent: AgentOnDisk,
  baseDir: string,
): Promise<AgentWire> {
  const prompt = await resolveAgentPrompt(logical, agent, baseDir);

  const wire: AgentWire = {
    name: agent.name,
    description: agent.description,
    prompt,
  };
  if (agent.is_public !== undefined) wire.is_public = agent.is_public;
  if (agent.agent_speaks_first !== undefined) wire.agent_speaks_first = agent.agent_speaks_first;
  if (agent.tools !== undefined) wire.tools = agent.tools;
  if (agent.uses_prompt_args !== undefined) wire.uses_prompt_args = agent.uses_prompt_args;
  if (agent.prompt_arg_names !== undefined) wire.prompt_arg_names = agent.prompt_arg_names;
  if (agent.voice_id !== undefined) wire.voice_id = agent.voice_id;
  if (agent.realtime_voice !== undefined) wire.realtime_voice = agent.realtime_voice;
  if (agent.initialize_tool_id !== undefined) wire.initialize_tool_id = agent.initialize_tool_id;
  if (agent.model_id !== undefined) wire.model_id = agent.model_id;
  return wire;
}

// ---------- field resolvers ----------

async function resolveCode(
  logical: string,
  tool: ToolOnDisk,
  baseDir: string,
): Promise<string | undefined | null> {
  const hasInline = tool.code !== undefined && tool.code !== null && tool.code !== "";
  const hasFile = !!tool.code_file;
  if (hasInline && hasFile) {
    throw new AjentifyError(
      `tool '${logical}' has both 'code' and 'code_file'; pick one.`,
    );
  }
  if (hasFile) {
    const text = await readText(tool.code_file as string, baseDir, `tools.${logical}.code_file`);
    // Match the Python prototype: .py files conventionally end with a single
    // newline; strip it so re-deploys of unchanged code stay no-ops.
    return text.endsWith("\n") ? text.slice(0, -1) : text;
  }
  return tool.code ?? undefined;
}

async function resolveToolInputSchema(
  logical: string,
  tool: ToolOnDisk,
  baseDir: string,
) {
  const hasInline =
    tool.input_schema !== undefined && tool.input_schema !== null;
  const hasFile = !!tool.input_schema_file;
  if (hasInline && hasFile) {
    throw new AjentifyError(
      `tool '${logical}' has both 'input_schema' and 'input_schema_file'; pick one.`,
    );
  }
  if (hasFile) {
    return await loadZodSchemaAsJsonSchema(
      tool.input_schema_file as string,
      baseDir,
      `tools.${logical}.input_schema_file`,
    );
  }
  return tool.input_schema ?? undefined;
}

async function resolveSREOutputSchema(
  logical: string,
  sre: SREOnDisk,
  baseDir: string,
) {
  const hasInline = sre.output_schema !== undefined;
  const hasFile = !!sre.output_schema_file;
  if (hasInline && hasFile) {
    throw new AjentifyError(
      `sre '${logical}' has both 'output_schema' and 'output_schema_file'; pick one.`,
    );
  }
  if (hasFile) {
    return await loadZodSchemaAsJsonSchema(
      sre.output_schema_file as string,
      baseDir,
      `sres.${logical}.output_schema_file`,
    );
  }
  if (sre.output_schema === undefined) {
    throw new AjentifyError(
      `sre '${logical}' is missing both 'output_schema' and 'output_schema_file' (one is required).`,
    );
  }
  return sre.output_schema;
}

async function resolveSREPromptTemplate(
  logical: string,
  sre: SREOnDisk,
  baseDir: string,
): Promise<string> {
  const hasInline = sre.prompt_template !== undefined && sre.prompt_template !== "";
  const hasFile = !!sre.prompt_template_file;
  if (hasInline && hasFile) {
    throw new AjentifyError(
      `sre '${logical}' has both 'prompt_template' and 'prompt_template_file'; pick one.`,
    );
  }
  if (hasFile) {
    return await readText(
      sre.prompt_template_file as string,
      baseDir,
      `sres.${logical}.prompt_template_file`,
    );
  }
  if (sre.prompt_template === undefined) {
    throw new AjentifyError(
      `sre '${logical}' is missing both 'prompt_template' and 'prompt_template_file' (one is required).`,
    );
  }
  return sre.prompt_template;
}

async function resolveAgentPrompt(
  logical: string,
  agent: AgentOnDisk,
  baseDir: string,
): Promise<string> {
  const hasInline = agent.prompt !== undefined && agent.prompt !== "";
  const hasFile = !!agent.prompt_file;
  if (hasInline && hasFile) {
    throw new AjentifyError(
      `agent '${logical}' has both 'prompt' and 'prompt_file'; pick one.`,
    );
  }
  if (hasFile) {
    return await readText(
      agent.prompt_file as string,
      baseDir,
      `agents.${logical}.prompt_file`,
    );
  }
  if (agent.prompt === undefined) {
    throw new AjentifyError(
      `agent '${logical}' is missing both 'prompt' and 'prompt_file' (one is required).`,
    );
  }
  return agent.prompt;
}

// ---------- helpers ----------

async function readText(
  relPath: string,
  baseDir: string,
  context: string,
): Promise<string> {
  const abs = isAbsolute(relPath) ? relPath : resolve(baseDir, relPath);
  try {
    return await readFile(abs, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new AjentifyError(`${context} points to '${relPath}' but ${abs} does not exist.`);
    }
    throw new AjentifyError(`${context}: failed to read ${abs}: ${(err as Error).message}`);
  }
}
