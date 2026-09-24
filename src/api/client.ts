import { AjentifyError } from "../errors.js";
import type { DeployRequest, DeployResponse, ManifestWire } from "../manifest/types.js";

export const DEFAULT_BASE_URL = "https://api.ajentify.com";

export interface PostDeployArgs {
  apiKey: string;
  stage: string;
  manifest: ManifestWire;
  /** If true, hits POST /deploy/plan (dry-run). */
  plan?: boolean;
  /** Optional org pin; defaults to the API key's first org server-side. */
  orgId?: string;
  /** Override for testing / self-hosted backends. */
  baseUrl?: string;
  /** Override fetch (for tests). */
  fetchImpl?: typeof fetch;
}

/**
 * Thin wrapper around POST /deploy and POST /deploy/plan. Errors surface
 * the server's response body verbatim so the operator can see Pydantic
 * validation messages without paging through HTTP plumbing.
 */
export async function postDeploy(args: PostDeployArgs): Promise<DeployResponse> {
  const baseUrl = (args.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const path = args.plan ? "/deploy/plan" : "/deploy";
  const url = `${baseUrl}${path}`;

  const body: DeployRequest = {
    stage: args.stage,
    manifest: args.manifest,
  };
  if (args.orgId) body.org_id = args.orgId;

  const fetchImpl = args.fetchImpl ?? fetch;

  let resp: Response;
  try {
    resp = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new AjentifyError(`Network error calling ${url}: ${(err as Error).message}`);
  }

  const text = await resp.text();

  if (!resp.ok) {
    throw new AjentifyError(`HTTP ${resp.status} from ${path}:\n${text}`);
  }

  try {
    return JSON.parse(text) as DeployResponse;
  } catch (err) {
    throw new AjentifyError(
      `Could not parse ${path} response as JSON (status ${resp.status}): ${(err as Error).message}\n${text}`,
    );
  }
}
