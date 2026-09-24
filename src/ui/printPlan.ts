import pc from "picocolors";

import type { DeployResponse, ResourceOp } from "../manifest/types.js";

export interface PrintPlanOptions {
  plan: boolean;
  log?: (line: string) => void;
}

/**
 * Pretty-print a /deploy or /deploy/plan response. Mirrors `print_response`
 * in the Python prototype (ReBinProject/pod-backend/ajentify/deploy.py) so
 * users moving between the two see the same output.
 */
export function printDeployResponse(response: DeployResponse, options: PrintPlanOptions): void {
  const log = options.log ?? ((line: string) => console.log(line));
  const label = options.plan ? "PLAN" : "DEPLOY";

  log(pc.bold(`--- ${label} ---`));

  const stageLine = response.stage_created
    ? `${response.stage_name} ${pc.dim("(newly created)")}`
    : response.stage_name;
  log(`stage:         ${stageLine}`);

  const summary = response.summary ?? {};
  const summaryParts = Object.entries(summary).map(([k, v]) => `${k}=${v}`);
  log(
    `summary:       ${summaryParts.length > 0 ? summaryParts.join(", ") : pc.dim("(none)")}`,
  );

  log("operations:");
  const ops = response.operations ?? [];
  if (ops.length === 0) {
    log(pc.dim("  (none)"));
    return;
  }
  for (const op of ops) {
    log(`  ${formatOp(op)}`);
  }
}

function formatOp(op: ResourceOp): string {
  const action = pad(op.op, 6);
  const kind = pad(op.kind, 6);
  const name = op.logical_name;
  const rid = op.resource_id ? pc.dim(`  [${op.resource_id}]`) : "";
  return `${colorAction(op.op, action)} ${kind} ${name}${rid}`;
}

function colorAction(action: string, padded: string): string {
  switch (action) {
    case "create":
      return pc.green(padded);
    case "update":
      return pc.yellow(padded);
    case "delete":
      return pc.red(padded);
    case "noop":
      return pc.dim(padded);
    default:
      return padded;
  }
}

function pad(s: string, width: number): string {
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}
