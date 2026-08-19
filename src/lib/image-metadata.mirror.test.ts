import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The mobile app cannot import from this package, so it carries a copy of the
 * metadata stripper. Both upload user photos into the same public bucket, so the
 * copies drifting apart would mean EXIF and GPS leaking from one client and not
 * the other. This test is the thing that stops that happening quietly.
 */

const WEB = join(process.cwd(), "src/lib/image-metadata.ts");
const MOBILE = join(process.cwd(), "mobile-app/src/lib/image-metadata.ts");

function body(source: string) {
  // The mirror carries a header explaining itself, and exports one extra helper.
  const marker = "Everything below this header is copied verbatim.";
  const index = source.indexOf(marker);
  const copied = index === -1 ? source : source.slice(source.indexOf("\n", index) + 1);
  return copied.replace(/^\s*\/\/.*$/gm, "").trim();
}

describe("mobile metadata stripper mirror", () => {
  it("is identical to the web copy", () => {
    expect(body(readFileSync(MOBILE, "utf8"))).toBe(body(readFileSync(WEB, "utf8")));
  });

  it("still exposes what the mobile upload path calls", () => {
    const mobile = readFileSync(MOBILE, "utf8");
    expect(mobile).toContain("export function stripImageMetadata");
  });
});
