import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { parseBinary } from "../src/lib/macho/parse.ts";
import { buildFat, buildThin, packVersion, toArrayBuffer } from "./helpers/build.ts";

function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

describe("rejects things that are not Mach-O", () => {
  test("plain text", () => {
    const bytes = new TextEncoder().encode("# Northbank\n\nA README, not a binary.");
    const parsed = parseBinary(toArrayBuffer(bytes), "README.md");
    assert.equal(parsed.slices.length, 0);
    assert.equal(parsed.warnings.length, 1);
    assert.match(parsed.warnings[0], /Not a Mach-O file/);
  });

  test("an empty file", () => {
    const parsed = parseBinary(new ArrayBuffer(0), "empty");
    assert.equal(parsed.slices.length, 0);
    assert.match(parsed.warnings[0], /too small/);
  });

  test("a two-byte file", () => {
    const parsed = parseBinary(new ArrayBuffer(2), "tiny");
    assert.equal(parsed.slices.length, 0);
  });

  test("an ELF header", () => {
    const bytes = new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]);
    const parsed = parseBinary(toArrayBuffer(bytes), "linux-binary");
    assert.equal(parsed.slices.length, 0);
    assert.match(parsed.warnings[0], /Not a Mach-O file/);
  });
});

describe("survives malformed headers", () => {
  test("an implausible load command count", () => {
    const parsed = parseBinary(toArrayBuffer(buildThin({ overrideNcmds: 999_999 })), "bad-ncmds");
    assert.equal(parsed.slices.length, 0);
    assert.match(parsed.warnings[0], /implausible/);
  });

  test("a command table longer than the file", () => {
    const parsed = parseBinary(toArrayBuffer(buildThin({ overrideSizeofcmds: 1_000_000 })), "bad-size");
    assert.equal(parsed.slices.length, 0);
    assert.match(parsed.warnings[0], /load commands/);
  });

  test("a truncated fat binary reports which slices are missing", () => {
    const slice = buildThin({});
    const full = buildFat([{ cpu: 0x0100000c, subtype: 2, bytes: slice }]);
    const truncated = full.subarray(0, 64);
    const parsed = parseBinary(toArrayBuffer(truncated), "cut");

    assert.equal(parsed.container, "fat");
    assert.equal(parsed.slices.length, 0);
    assert.ok(parsed.warnings.some((w) => /points outside the file|runs past the end/.test(w)));
  });

  test("a fat header whose architecture table is cut off", () => {
    const bytes = new Uint8Array(20);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, 0xcafebabe, false);
    view.setUint32(4, 4, false);

    const parsed = parseBinary(toArrayBuffer(bytes), "cut-table");
    assert.equal(parsed.slices.length, 0);
    assert.match(parsed.warnings[0], /runs past the end/);
  });

  test("a fat slice that does not start with a Mach-O magic", () => {
    const junk = new Uint8Array(256).fill(0x41);
    const parsed = parseBinary(
      toArrayBuffer(buildFat([{ cpu: 0x0100000c, subtype: 2, bytes: junk }])),
      "junk-slice",
    );
    assert.equal(parsed.slices.length, 0);
    assert.ok(parsed.warnings.some((w) => /does not start with a Mach-O magic/.test(w)));
  });

  test("a fat header claiming zero architectures", () => {
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setUint32(0, 0xcafebabe, false);
    new DataView(bytes.buffer).setUint32(4, 0, false);
    const parsed = parseBinary(toArrayBuffer(bytes), "zero-arch");
    assert.equal(parsed.slices.length, 0);
    assert.match(parsed.warnings[0], /Refusing/);
  });
});

describe("cannot be crashed by random input", () => {
  test("300 random buffers", () => {
    const random = rng(0xc0ffee);
    for (let i = 0; i < 300; i++) {
      const length = Math.floor(random() * 4096);
      const bytes = new Uint8Array(length);
      for (let b = 0; b < length; b++) bytes[b] = Math.floor(random() * 256);
      assert.doesNotThrow(() => parseBinary(toArrayBuffer(bytes), `random-${i}`));
    }
  });

  test("300 mutated copies of a valid binary", () => {
    const random = rng(0xbadf00d);
    const original = buildThin({
      uuid: "a55102ccd10e32419ab3f5a0276a7199",
      dylibs: [{ name: "/usr/lib/libSystem.B.dylib", current: packVersion(1), compatibility: packVersion(1) }],
      rpath: "@executable_path",
      buildVersion: { platform: 1, minos: packVersion(13), sdk: packVersion(13) },
      entryPoint: { entryoff: 0x100, stacksize: 0 },
      symtab: { symoff: 0x10, nsyms: 4, stroff: 0x20, strsize: 40 },
      entitlementsXml: "<plist><dict><key>a</key><true/></dict></plist>",
    });

    for (let i = 0; i < 300; i++) {
      const copy = original.slice();
      const mutations = 1 + Math.floor(random() * 24);
      for (let m = 0; m < mutations; m++) {
        const at = Math.floor(random() * copy.length);
        copy[at] = Math.floor(random() * 256);
      }
      assert.doesNotThrow(() => parseBinary(toArrayBuffer(copy), `mutated-${i}`));
    }
  });

  test("every random buffer that does parse stays structurally sane", () => {
    const random = rng(0x5eed);
    for (let i = 0; i < 200; i++) {
      const length = 32 + Math.floor(random() * 2048);
      const bytes = new Uint8Array(length);
      for (let b = 0; b < length; b++) bytes[b] = Math.floor(random() * 256);
      // Make sure the magic looks plausible so parsing goes deep.
      new DataView(bytes.buffer).setUint32(0, 0xfeedfacf, true);

      const parsed = parseBinary(toArrayBuffer(bytes), `deep-${i}`);
      for (const slice of parsed.slices) {
        assert.ok(Number.isFinite(slice.offset));
        assert.ok(Number.isFinite(slice.size));
        assert.ok(slice.offset >= 0);
        for (const section of slice.sections) {
          assert.ok(Number.isFinite(section.size));
          assert.ok(Number.isFinite(section.offset));
        }
        for (const command of slice.loadCommands) {
          assert.ok(command.cmdsize >= 8);
        }
      }
    }
  });
});
