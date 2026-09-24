# ajentify

CLI and programmatic API for deploying [Ajentify](https://ajentify.com) stages from a declarative `ajentify.json` manifest.

The wire format that `POST /deploy` expects forces you to inline every prompt, every tool's Python source, and every JSON Schema into one file. This package lets you keep each of those in its own file (Markdown for prompts, `.py` for tool code, `.ts` Zod types for schemas) and inlines them at deploy time.

## Install

```bash
npm install --save-dev @ajentify/cli
```

(Or use `npx @ajentify/cli` without installing. The bin is `ajentify`, so once installed locally `npx ajentify ...` works too.)

## Quick start

```bash
npx ajentify init
# Add AJENTIFY_API_KEY to .env, then:
npx ajentify deploy staging --plan   # dry-run
npx ajentify deploy staging          # apply
```

`ajentify init` creates:

- `ajentify.json` — empty manifest, `$schema`-anchored for editor autocomplete
- `AGENTS.md` — exhaustive reference for coding agents (and humans). Describes stages, the manifest shape, every field on every resource, and the file-reference helpers.
- `.env.example` — placeholder for `AJENTIFY_API_KEY`
- Appends `.env` and `AGENTS.md` to `.gitignore` (creates it if missing)

## Convenience file references

The on-disk `ajentify.json` is a superset of the [server schema](https://api.ajentify.com/docs/manifest-schema.json). The CLI strips the extra `*_file` fields after inlining; the body sent to `/deploy` matches the wire schema exactly.

| Resource | Inline field | File reference field |
| --- | --- | --- |
| Agent | `prompt` | `prompt_file: "prompts/pod.md"` |
| Tool | `code` | `code_file: "tools/sort_item.py"` |
| Tool | `input_schema` | `input_schema_file: "schemas/sortItem.ts#SortItemInput"` |
| SRE | `output_schema` | `output_schema_file: "schemas/classify.ts#ClassifyOutput"` |
| SRE | `prompt_template` | `prompt_template_file: "prompts/classify.md"` |

The `#ExportName` fragment on `*_schema_file` picks the named export (defaults to `default`). Paths are resolved relative to the manifest file's directory. Setting both the inline and the `*_file` form for the same field is a hard error.

## CLI

### `ajentify init [--force]`

Scaffold an empty manifest in the current directory. Refuses to overwrite an existing `ajentify.json` unless `--force` is passed.

### `ajentify deploy <stage> [--plan] [--manifest <path>] [--org-id <id>]`

Resolve all file references in the manifest, then `POST` it to `/deploy` (or `/deploy/plan` if `--plan`).

- `<stage>` — must match `^[a-z][a-z0-9-]{0,62}$`. Created on the server if it doesn't exist.
- `--plan` — dry-run; shows the diff that would be applied without changing anything.
- `--manifest <path>` — defaults to `./ajentify.json`.
- `--org-id <id>` — pin a specific org; defaults to the API key's first org.

The API key is read from `process.env.AJENTIFY_API_KEY`, or from the nearest `.env` walking up from the manifest's directory.

## Programmatic API

```ts
import { resolveManifest, deployStage } from "@ajentify/cli";

const wire = await resolveManifest(manifest, { baseDir: "/path/to/project" });
await deployStage({ stage: "staging", manifestPath: "./ajentify.json" });
```

## Development

```bash
npm install
npm run build
npm test
```
