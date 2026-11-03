/**
 * Integration tests against binaries that ship with macOS. These are skipped
 * automatically on other platforms or when the file is absent, so the suite
 * still runs on a Linux CI box.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { parseBinary } from "../src/lib/macho/parse.ts";

function load(path: string): ArrayBuffer | null {
  if (!existsSync(path)) return null;
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

const cat = load("/bin/cat");
const ps = load("/bin/ps");

describe("real system binaries", () => {
  test("/bin/cat is a universal binary with two slices", { skip: !cat }, () => {
    const parsed = parseBinary(cat as ArrayBuffer, "cat");
    assert.equal(parsed.container, "fat");
    assert.equal(parsed.fatArchCount, 2);
    assert.equal(parsed.slices.length, 2);
    assert.deepEqual(parsed.slices.map((s) => s.cpuName), ["x86_64", "arm64"]);
  });

  test("/bin/cat links libSystem and is signed by Apple", { skip: !cat }, () => {
    const parsed = parseBinary(cat as ArrayBuffer, "cat");
    for (const slice of parsed.slices) {
      assert.ok(slice.segments.some((s) => s.name === "__TEXT"));
      assert.ok(slice.dylibs.some((d) => d.name === "/usr/lib/libSystem.B.dylib"));
      assert.equal(slice.codeSignature?.codeDirectory?.identifier, "com.apple.cat");
      assert.equal(slice.codeSignature?.codeDirectory?.hashType, "SHA-256");
    }
  });

  test("/bin/cat yields readable strings", { skip: !cat }, () => {
    const parsed = parseBinary(cat as ArrayBuffer, "cat");
    const values = parsed.slices[0].strings.map((s) => s.value);
    assert.ok(values.some((v) => v.includes("usage: cat")));
  });

  test("/bin/ps exposes its entitlements", { skip: !ps }, () => {
    const parsed = parseBinary(ps as ArrayBuffer, "ps");
    const xml = parsed.slices[0].codeSignature?.entitlementsXml;
    assert.ok(xml, "expected entitlements on /bin/ps");
    assert.ok(xml.includes("com.apple.private.persona-mgmt"));
    assert.ok(xml.includes("com.apple.system-task-ports.read"));
  });

  test("structural invariants hold on every slice", { skip: !cat }, () => {
    const parsed = parseBinary(cat as ArrayBuffer, "cat");
    for (const slice of parsed.slices) {
      for (const section of slice.sections) {
        if (section.size === 0) continue;
        assert.ok(
          section.offset + section.size <= slice.size,
          `section ${section.segname},${section.name} runs past the slice`,
        );
      }
      for (const dylib of slice.dylibs) {
        assert.ok(
          dylib.name.startsWith("/") || dylib.name.startsWith("@"),
          `unexpected dylib path: ${dylib.name}`,
        );
      }
      if (slice.sourceVersion) {
        assert.match(slice.sourceVersion, /^\d+\.\d+\.\d+\.\d+\.\d+$/);
      }
      assert.equal(slice.loadCommands.length, slice.ncmds);
    }
  });
});
