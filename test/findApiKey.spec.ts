import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { findApiKey, parseDotenv } from "../src/env/findApiKey.js";
import { AjentifyError } from "../src/errors.js";

describe("parseDotenv", () => {
  it("parses KEY=VALUE pairs", () => {
    expect(parseDotenv("FOO=bar\nBAZ=qux")).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  it("ignores comments and blank lines", () => {
    expect(parseDotenv("# comment\n\nFOO=bar\n")).toEqual({ FOO: "bar" });
  });

  it("strips matching outer quotes", () => {
    expect(parseDotenv(`FOO="bar"\nBAZ='qux'\nNOPE="mismatched'`)).toEqual({
      FOO: "bar",
      BAZ: "qux",
      NOPE: `"mismatched'`,
    });
  });

  it("trims whitespace around key and value", () => {
    expect(parseDotenv("  FOO  =  bar  ")).toEqual({ FOO: "bar" });
  });
});

describe("findApiKey", () => {
  it("prefers process env", () => {
    const dir = mkdtempSync(join(tmpdir(), "ajentify-key-"));
    const key = findApiKey({ startDir: dir, env: { AJENTIFY_API_KEY: "from-env" } });
    expect(key).toBe("from-env");
  });

  it("falls back to .env in the start directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "ajentify-key-"));
    writeFileSync(join(dir, ".env"), "AJENTIFY_API_KEY=from-dotenv\n");
    const key = findApiKey({ startDir: dir, env: {} });
    expect(key).toBe("from-dotenv");
  });

  it("walks up to find .env in a parent directory", () => {
    const root = mkdtempSync(join(tmpdir(), "ajentify-key-"));
    const sub = join(root, "a", "b", "c");
    mkdirSync(sub, { recursive: true });
    writeFileSync(join(root, ".env"), "AJENTIFY_API_KEY=from-parent\n");
    const key = findApiKey({ startDir: sub, env: {} });
    expect(key).toBe("from-parent");
  });

  it("throws AjentifyError when not found anywhere", () => {
    const dir = mkdtempSync(join(tmpdir(), "ajentify-key-"));
    expect(() => findApiKey({ startDir: dir, env: {} })).toThrow(AjentifyError);
  });
});
