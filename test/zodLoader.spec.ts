import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { AjentifyError } from "../src/errors.js";
import { loadZodSchemaAsJsonSchema, parseSchemaRef } from "../src/schema/zodLoader.js";

const FIXTURES = resolve(__dirname, "fixtures");

describe("parseSchemaRef", () => {
  it("returns undefined export when there's no fragment", () => {
    expect(parseSchemaRef("schemas/a.ts")).toEqual({
      filePath: "schemas/a.ts",
      exportName: undefined,
    });
  });

  it("splits at the first hash", () => {
    expect(parseSchemaRef("schemas/a.ts#FooBar")).toEqual({
      filePath: "schemas/a.ts",
      exportName: "FooBar",
    });
  });

  it("rejects an empty file path", () => {
    expect(() => parseSchemaRef("#Foo")).toThrow(AjentifyError);
  });

  it("rejects an empty export name", () => {
    expect(() => parseSchemaRef("schemas/a.ts#")).toThrow(AjentifyError);
  });
});

describe("loadZodSchemaAsJsonSchema", () => {
  it("loads a named export and converts to JSON Schema", async () => {
    const result = await loadZodSchemaAsJsonSchema(
      "schemas/sortItem.ts#SortItemInput",
      FIXTURES,
    );
    const json = JSON.stringify(result);
    expect(json).toContain("classification");
    expect(json).toContain("cardboard");
  });

  it("falls back to the default export when no fragment is given", async () => {
    const result = await loadZodSchemaAsJsonSchema("schemas/sortItem.ts", FIXTURES);
    expect(JSON.stringify(result)).toContain("classification");
  });

  it("uses the sole named export if there's no default and exactly one export", async () => {
    const result = await loadZodSchemaAsJsonSchema(
      "schemas/classifyOutput.ts",
      FIXTURES,
    );
    expect(JSON.stringify(result)).toContain("confidence");
  });

  it("throws AjentifyError for a missing file", async () => {
    await expect(
      loadZodSchemaAsJsonSchema("schemas/does-not-exist.ts", FIXTURES),
    ).rejects.toThrow(AjentifyError);
  });

  it("throws AjentifyError for an unknown named export", async () => {
    await expect(
      loadZodSchemaAsJsonSchema("schemas/sortItem.ts#Nope", FIXTURES),
    ).rejects.toThrow(/no export named 'Nope'/);
  });

  it("throws AjentifyError when the export isn't a Zod schema", async () => {
    await expect(
      loadZodSchemaAsJsonSchema("schemas/notZod.ts#NotASchema", FIXTURES),
    ).rejects.toThrow(/not a Zod schema/);
  });
});
