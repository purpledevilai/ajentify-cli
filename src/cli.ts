import { Command } from "commander";
import pc from "picocolors";

import { deployStage } from "./commands/deploy.js";
import { init } from "./commands/init.js";
import { AjentifyError } from "./errors.js";

// Lazy version read: `package.json` isn't a TS module we can statically import,
// but commander prints something useful even if we hard-code. We avoid `fs`
// at import time because the bundled CLI may live in a different relative
// location to package.json depending on packaging.
const VERSION = "0.1.0";

const program = new Command();

program
  .name("ajentify")
  .description(
    "CLI for deploying Ajentify stages from a declarative ajentify.json manifest.",
  )
  .version(VERSION);

program
  .command("init")
  .description("Scaffold ajentify.json, AGENTS.md and .env.example in the current directory.")
  .option("--force", "Overwrite existing ajentify.json")
  .action(async (opts: { force?: boolean }) => {
    await init({ force: opts.force ?? false });
  });

program
  .command("deploy")
  .argument("<stage>", "Target stage name (e.g. 'staging', 'production')")
  .description("Resolve file references and POST the manifest to /deploy.")
  .option("--plan", "Dry-run via POST /deploy/plan (no changes applied)")
  .option("--manifest <path>", "Path to the manifest JSON", "ajentify.json")
  .option("--org-id <id>", "Pin a specific org. Defaults to the API key's first org.")
  .option("--base-url <url>", "Override the API base URL (advanced).")
  .action(
    async (
      stage: string,
      opts: { plan?: boolean; manifest: string; orgId?: string; baseUrl?: string },
    ) => {
      await deployStage({
        stage,
        manifestPath: opts.manifest,
        plan: opts.plan ?? false,
        ...(opts.orgId !== undefined ? { orgId: opts.orgId } : {}),
        ...(opts.baseUrl !== undefined ? { baseUrl: opts.baseUrl } : {}),
      });
    },
  );

// Top-level error handler: AjentifyError is "expected" and gets the friendly
// single-line treatment; everything else falls through with a stack so genuine
// bugs are visible.
program.parseAsync(process.argv).catch((err: unknown) => {
  if (err instanceof AjentifyError) {
    process.stderr.write(pc.red(`error: ${err.message}\n`));
    process.exit(1);
  }
  process.stderr.write(pc.red(`unexpected error: ${(err as Error).stack ?? err}\n`));
  process.exit(1);
});
