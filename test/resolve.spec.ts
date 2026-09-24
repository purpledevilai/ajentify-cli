import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { loadManifest } from "../src/manifest/load.js";
import { resolveManifest } from "../src/manifest/resolve.js";
import { AjentifyError } from "../src/errors.js";
import type { ManifestOnDisk } from "../src/manifest/types.js";

const FIXTURES = resolve(__dirname, "fixtures");

describe("resolveManifest", () => {
  it("inlines prompt_file, code_file, input_schema_file, output_schema_file, prompt_template_file", async () => {
    const loaded = await loadManifest(join(FIXTURES, "ajentify.json"));
    const wire = await resolveManifest(loaded.manifest, { baseDir: loaded.dir });

    // Tool: code_file inlined, trailing newline trimmed; input_schema present.
    const tool = wire.tools?.sort_item;
    expect(tool?.name).toBe("sort_item");
    expect(tool?.code).toBe('def sort_item(classification, context):\n    return {"classification": classification}');
    expect(tool?.code?.endsWith("\n")).toBe(false);
    expect(tool?.input_schema).toBeTypeOf("object");
    expect(JSON.stringify(tool?.input_schema)).toContain("classification");
    expect(JSON.stringify(tool?.input_schema)).toContain("cardboard");
    expect(tool?.pass_context).toBe(true);
    expect(tool).not.toHaveProperty("input_schema_file");
    expect(tool).not.toHaveProperty("code_file");

    // SRE: output_schema and prompt_template both inlined.
    const sre = wire.sres?.classify;
    expect(sre?.output_schema).toBeTypeOf("object");
    expect(JSON.stringify(sre?.output_schema)).toContain("confidence");
    expect(sre?.prompt_template).toContain("ITEM_DESCRIPTION");
    expect(sre).not.toHaveProperty("output_schema_file");
    expect(sre).not.toHaveProperty("prompt_template_file");

    // Agent: prompt inlined.
    const agent = wire.agents?.pod;
    expect(agent?.prompt).toContain("You are Pod");
    expect(agent?.tools).toEqual(["sort_item", "get_time"]);
    expect(agent).not.toHaveProperty("prompt_file");
  });

  it("rejects a tool that sets both code and code_file", async () => {
    const manifest: ManifestOnDisk = {
      tools: {
        bad: {
          name: "bad",
          code: "def x(): pass",
          code_file: "tools/sort_item.py",
        },
      },
    };
    await expect(resolveManifest(manifest, { baseDir: FIXTURES })).rejects.toThrow(
      /'code' and 'code_file'/,
    );
  });

  it("rejects an agent that sets both prompt and prompt_file", async () => {
    const manifest: ManifestOnDisk = {
      agents: {
        bad: {
          name: "Bad",
          description: "",
          prompt: "hi",
          prompt_file: "prompts/pod.md",
        },
      },
    };
    await expect(resolveManifest(manifest, { baseDir: FIXTURES })).rejects.toThrow(
      /'prompt' and 'prompt_file'/,
    );
  });

  it("requires either output_schema or output_schema_file on an SRE", async () => {
    const manifest: ManifestOnDisk = {
      sres: {
        bad: {
          name: "Bad",
          prompt_template: "x",
        },
      },
    };
    await expect(resolveManifest(manifest, { baseDir: FIXTURES })).rejects.toThrow(
      /output_schema/,
    );
  });

  it("requires either prompt or prompt_file on an agent", async () => {
    const manifest: ManifestOnDisk = {
      agents: {
        bad: {
          name: "Bad",
          description: "no prompt",
        },
      },
    };
    await expect(resolveManifest(manifest, { baseDir: FIXTURES })).rejects.toThrow(
      /prompt/,
    );
  });

  it("reports a clear error when a referenced file is missing", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "ajentify-resolve-"));
    const manifestPath = join(tmp, "ajentify.json");
    writeFileSync(
      manifestPath,
      JSON.stringify({
        agents: {
          pod: {
            name: "Pod",
            description: "x",
            prompt_file: "prompts/missing.md",
          },
        },
      }),
    );
    const loaded = await loadManifest(manifestPath);
    await expect(resolveManifest(loaded.manifest, { baseDir: loaded.dir })).rejects.toThrow(
      AjentifyError,
    );
    await expect(resolveManifest(loaded.manifest, { baseDir: loaded.dir })).rejects.toThrow(
      /does not exist/,
    );
  });
});
