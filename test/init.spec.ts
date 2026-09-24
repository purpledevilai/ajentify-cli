import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ensureGitignoreEntries, init } from "../src/commands/init.js";
import { AjentifyError } from "../src/errors.js";

function tmp(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

describe("init", () => {
  it("scaffolds ajentify.json, AGENTS.md, .env.example, and a .gitignore", async () => {
    const dir = tmp("ajentify-init-");
    await init({ cwd: dir, log: () => {} });

    expect(existsSync(join(dir, "ajentify.json"))).toBe(true);
    expect(existsSync(join(dir, "AGENTS.md"))).toBe(true);
    expect(existsSync(join(dir, ".env.example"))).toBe(true);

    const gitignore = readFileSync(join(dir, ".gitignore"), "utf8");
    expect(gitignore).toContain(".env");
    expect(gitignore).toContain("AGENTS.md");
  });

  it("refuses to overwrite an existing ajentify.json without --force", async () => {
    const dir = tmp("ajentify-init-");
    writeFileSync(join(dir, "ajentify.json"), "{}");
    await expect(init({ cwd: dir, log: () => {} })).rejects.toThrow(AjentifyError);
  });

  it("overwrites with --force", async () => {
    const dir = tmp("ajentify-init-");
    writeFileSync(join(dir, "ajentify.json"), "{}");
    await init({ cwd: dir, force: true, log: () => {} });
    const written = readFileSync(join(dir, "ajentify.json"), "utf8");
    expect(written).toContain("$schema");
  });
});

describe("ensureGitignoreEntries", () => {
  it("creates the file when missing", async () => {
    const dir = tmp("ajentify-gi-");
    const result = await ensureGitignoreEntries(dir, [".env", "AGENTS.md"]);
    expect(result.created).toBe(true);
    expect(result.added).toEqual([".env", "AGENTS.md"]);
    expect(readFileSync(join(dir, ".gitignore"), "utf8")).toContain("# ajentify");
  });

  it("appends only missing entries", async () => {
    const dir = tmp("ajentify-gi-");
    writeFileSync(join(dir, ".gitignore"), "node_modules/\n.env\n");
    const result = await ensureGitignoreEntries(dir, [".env", "AGENTS.md"]);
    expect(result.created).toBe(false);
    expect(result.added).toEqual(["AGENTS.md"]);
    const body = readFileSync(join(dir, ".gitignore"), "utf8");
    expect(body.match(/^\.env$/gm)).toHaveLength(1);
    expect(body).toContain("AGENTS.md");
  });

  it("is a no-op when everything is already present", async () => {
    const dir = tmp("ajentify-gi-");
    writeFileSync(join(dir, ".gitignore"), ".env\nAGENTS.md\n");
    const result = await ensureGitignoreEntries(dir, [".env", "AGENTS.md"]);
    expect(result.created).toBe(false);
    expect(result.added).toEqual([]);
    const body = readFileSync(join(dir, ".gitignore"), "utf8");
    expect(body).toBe(".env\nAGENTS.md\n");
  });

  it("does not duplicate on re-run", async () => {
    const dir = tmp("ajentify-gi-");
    await ensureGitignoreEntries(dir, [".env", "AGENTS.md"]);
    await ensureGitignoreEntries(dir, [".env", "AGENTS.md"]);
    const body = readFileSync(join(dir, ".gitignore"), "utf8");
    expect(body.match(/^\.env$/gm)).toHaveLength(1);
    expect(body.match(/^AGENTS\.md$/gm)).toHaveLength(1);
  });
});
