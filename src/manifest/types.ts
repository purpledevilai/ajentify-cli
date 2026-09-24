/**
 * TypeScript mirror of the server-side `Manifest` (see
 * Ajentify/AgentLambda/src/RequestHandlers/Deploy/ManifestSchema.py) plus the
 * on-disk-only `*_file` reference fields that this CLI inlines at deploy time.
 *
 * Two distinct shapes live in this file:
 *
 *   - `*OnDisk` types: what the user authors in ajentify.json. They include
 *     the convenience `*_file` fields and make the corresponding inline fields
 *     optional, because either form is acceptable (but not both).
 *
 *   - `*Wire` types: what the server actually accepts at POST /deploy. The
 *     resolver produces these from the on-disk shape by inlining file refs
 *     and stripping the `*_file` fields.
 */

export type JsonSchema = Record<string, unknown>;

// ---------- Tool ----------

export interface ToolWire {
  name: string;
  description?: string | null;
  input_schema?: JsonSchema | null;
  code?: string | null;
  pass_context?: boolean;
  is_async?: boolean;
  is_client_side_tool?: boolean;
}

export interface ToolOnDisk {
  name: string;
  description?: string | null;
  input_schema?: JsonSchema | null;
  input_schema_file?: string;
  code?: string | null;
  code_file?: string;
  pass_context?: boolean;
  is_async?: boolean;
  is_client_side_tool?: boolean;
}

// ---------- SRE ----------

export interface SREWire {
  name: string;
  description?: string | null;
  output_schema: JsonSchema;
  is_public?: boolean;
  prompt_template: string;
  variable_names?: string[] | null;
  model_id?: string | null;
}

export interface SREOnDisk {
  name: string;
  description?: string | null;
  output_schema?: JsonSchema;
  output_schema_file?: string;
  is_public?: boolean;
  prompt_template?: string;
  prompt_template_file?: string;
  variable_names?: string[] | null;
  model_id?: string | null;
}

// ---------- Agent ----------

export interface AgentWire {
  name: string;
  description: string;
  prompt: string;
  is_public?: boolean;
  agent_speaks_first?: boolean;
  tools?: string[] | null;
  uses_prompt_args?: boolean;
  prompt_arg_names?: string[] | null;
  voice_id?: string | null;
  realtime_voice?: string | null;
  initialize_tool_id?: string | null;
  model_id?: string | null;
}

export interface AgentOnDisk {
  name: string;
  description: string;
  prompt?: string;
  prompt_file?: string;
  is_public?: boolean;
  agent_speaks_first?: boolean;
  tools?: string[] | null;
  uses_prompt_args?: boolean;
  prompt_arg_names?: string[] | null;
  voice_id?: string | null;
  realtime_voice?: string | null;
  initialize_tool_id?: string | null;
  model_id?: string | null;
}

// ---------- Top-level manifest ----------

export interface ManifestWire {
  tools?: Record<string, ToolWire>;
  sres?: Record<string, SREWire>;
  agents?: Record<string, AgentWire>;
}

export interface ManifestOnDisk {
  $schema?: string;
  tools?: Record<string, ToolOnDisk>;
  sres?: Record<string, SREOnDisk>;
  agents?: Record<string, AgentOnDisk>;
}

// ---------- Deploy request / response ----------

export interface DeployRequest {
  stage: string;
  org_id?: string;
  manifest: ManifestWire;
}

export interface ResourceOp {
  kind: "parameter_definition" | "tool" | "sre" | "agent";
  op: "create" | "update" | "delete" | "noop";
  logical_name: string;
  resource_id?: string | null;
  diff_summary?: string | null;
}

export interface DeployResponse {
  stage_id: string;
  stage_name: string;
  stage_created: boolean;
  summary: Record<string, number>;
  operations: ResourceOp[];
}

// ---------- Validation regexes (mirror server) ----------

export const LOGICAL_NAME_PATTERN = /^[a-z][a-z0-9_]{0,62}$/;
export const STAGE_NAME_PATTERN = /^[a-z][a-z0-9-]{0,62}$/;
