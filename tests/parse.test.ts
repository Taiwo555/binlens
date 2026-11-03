import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { parseBinary } from "../src/lib/macho/parse.ts";
import { buildFat, buildThin, packVersion, toArrayBuffer } from "./helpers/build.ts";

const ENTITLEMENTS = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>com.apple.security.app-sandbox</key>
	<true/>
	<key>com.apple.security.network.client</key>
	<true/>
</dict>
</plist>`;

function sample(overrides: Parameters<typeof buildThin>[0] = {}) {
  return buildThin({
    uuid: "a55102ccd10e32419ab3f5a0276a7199",
    dylibs: [
      { name: "/usr/lib/libSystem.B.dylib", current: packVersion(1319), compatibility: packVersion(1) },
      { name: "/usr/lib/libobjc.A.dylib", current: packVersion(228, 0, 4), compatibility: packVersion(1) },
    ],
    rpath: "@executable_path/../Frameworks",
    buildVersion: { platform: 1, minos: packVersion(13, 1), sdk: packVersion(13, 3), tools: [{ tool: 1, version: packVersion(14, 0, 0) }] },
    sourceVersion: 0x0000000100000000,
    entryPoint: { entryoff: 0x3514, stacksize: 0 },
    symtab: { symoff: 0x8000, nsyms: 42, stroff: 0x9000, strsize: 512 },
    entitlementsXml: ENTITLEMENTS,
    identifier: "com.example.test",
    teamId: "GYZJYS7XUG",
    ...overrides,
  });
}

describe("thin binaries", () => {
  test("reads the 64-bit header", () => {
    const parsed = parseBinary(toArrayBuffer(sample()), "sample");
    assert.equal(parsed.container, "thin");
    assert.equal(parsed.slices.length, 1);

    const slice = parsed.slices[0];
    assert.equal(slice.is64, true);
    assert.equal(slice.le, true);
    assert.equal(slice.cpuName, "arm64");
    assert.equal(slice.subtypeName, "arm64e");
    assert.equal(slice.filetypeName, "executable");
    assert.equal(slice.index, 0);
  });

  test("decodes the flags bitfield", () => {
    const parsed = parseBinary(toArrayBuffer(buildThin({ flags: 0x00200085 })), "flags");
    const slice = parsed.slices[0];
    assert.ok(slice.flagNames.includes("MH_NOUNDEFS"));
    assert.ok(slice.flagNames.includes("MH_DYLDLINK"));
    assert.ok(slice.flagNames.includes("MH_TWOLEVEL"));
    assert.ok(slice.flagNames.includes("MH_PIE"));
  });

  test("reads segments and their sections", () => {
    const parsed = parseBinary(toArrayBuffer(sample()), "segments");
    const slice = parsed.slices[0];

    assert.equal(slice.segments.length, 1);
    const text = slice.segments[0];
    assert.equal(text.name, "__TEXT");
    assert.equal(text.initprot, 5);
    assert.equal(text.maxprot, 7);
    assert.equal(text.sections.length, 2);

    const cstring = text.sections.find((s) => s.name === "__cstring");
    assert.ok(cstring);
    assert.equal(cstring.typeName, "S_CSTRING_LITERALS");
    assert.equal(cstring.size, 12);
    assert.deepEqual(slice.sections.map((s) => s.name), ["__text", "__cstring"]);
  });

  test("reads linked libraries and their versions", () => {
    const parsed = parseBinary(toArrayBuffer(sample()), "dylibs");
    const dylibs = parsed.slices[0].dylibs;

    assert.equal(dylibs.length, 2);
    assert.equal(dylibs[0].name, "/usr/lib/libSystem.B.dylib");
    assert.equal(dylibs[0].currentVersion, "1319.0.0");
    assert.equal(dylibs[0].compatibilityVersion, "1.0.0");
    assert.equal(dylibs[0].kind, "LC_LOAD_DYLIB");
    assert.equal(dylibs[1].currentVersion, "228.0.4");
  });

  test("reads rpaths", () => {
    const parsed = parseBinary(toArrayBuffer(sample()), "rpath");
    assert.deepEqual(parsed.slices[0].rpaths, ["@executable_path/../Frameworks"]);
  });

  test("formats the UUID", () => {
    const parsed = parseBinary(toArrayBuffer(sample()), "uuid");
    assert.equal(parsed.slices[0].uuid, "a55102cc-d10e-3241-9ab3-f5a0276a7199");
  });

  test("reads build version, sdk and tools", () => {
    const parsed = parseBinary(toArrayBuffer(sample()), "build");
    const build = parsed.slices[0].buildVersion;
    assert.ok(build);
    assert.equal(build.platform, "macOS");
    assert.equal(build.minos, "13.1.0");
    assert.equal(build.sdk, "13.3.0");
    assert.deepEqual(build.tools, [{ tool: "clang", version: "14.0.0" }]);
  });

  test("reads the entry point", () => {
    const parsed = parseBinary(toArrayBuffer(sample()), "main");
    assert.deepEqual(parsed.slices[0].entryPoint, { fileOffset: 0x3514, stackSize: 0 });
  });

  test("decodes LC_SOURCE_VERSION as a24.b10.c10.d10.e10", () => {
    const cat = parseBinary(toArrayBuffer(buildThin({ sourceVersion: 0x00009a0000000000 })), "source");
    assert.equal(cat.slices[0].sourceVersion, "154.0.0.0.0");

    const ps = parseBinary(toArrayBuffer(buildThin({ sourceVersion: 0x0000c70000100000 })), "source-ps");
    assert.equal(ps.slices[0].sourceVersion, "199.0.1.0.0");
  });

  test("reads the symbol table", () => {
    const parsed = parseBinary(toArrayBuffer(sample()), "symtab");
    assert.deepEqual(parsed.slices[0].symtab, { symtabOffset: 0x8000, symbols: 42, stringBytes: 512 });
  });

  test("lists every load command in order", () => {
    const parsed = parseBinary(toArrayBuffer(sample()), "commands");
    const names = parsed.slices[0].loadCommands.map((c) => c.name);
    assert.deepEqual(names, [
      "LC_SEGMENT_64",
      "LC_LOAD_DYLIB",
      "LC_LOAD_DYLIB",
      "LC_RPATH",
      "LC_UUID",
      "LC_BUILD_VERSION",
      "LC_SOURCE_VERSION",
      "LC_MAIN",
      "LC_SYMTAB",
      "LC_CODE_SIGNATURE",
    ]);
    assert.equal(parsed.slices[0].loadCommands.length, parsed.slices[0].ncmds);
  });

  test("extracts strings from text sections only", () => {
    const parsed = parseBinary(toArrayBuffer(sample()), "strings");
    const values = parsed.slices[0].strings.map((s) => s.value);
    assert.ok(values.includes("hello"));
    assert.ok(values.includes("world"));
    for (const hit of parsed.slices[0].strings) {
      assert.equal(hit.section, "__cstring");
      assert.equal(hit.segname, "__TEXT");
    }
  });

  test("ignores machine code sections when collecting strings", () => {
    const parsed = parseBinary(
      toArrayBuffer(
        buildThin({
          sections: [
            { name: "__text", segname: "__TEXT", data: Uint8Array.from([0x55, 0x48, 0x89, 0xe5, 0x90, 0x90, 0x90, 0x90]) },
            { name: "__cstring", segname: "__TEXT", data: new TextEncoder().encode("real-string\0") },
          ],
        }),
      ),
      "code",
    );
    const values = parsed.slices[0].strings.map((s) => s.value);
    assert.deepEqual(values, ["real-string"]);
  });

  test("decodes UTF-16 strings in __ustring", () => {
    const text = "Payment Required";
    const bytes = new Uint8Array(text.length * 2);
    for (let i = 0; i < text.length; i++) {
      bytes[i * 2] = text.charCodeAt(i);
      bytes[i * 2 + 1] = 0;
    }

    const parsed = parseBinary(
      toArrayBuffer(buildThin({ sections: [{ name: "__ustring", segname: "__TEXT", data: bytes }] })),
      "utf16",
    );
    assert.deepEqual(parsed.slices[0].strings.map((s) => s.value), [text]);
  });

  test("splits UTF-16 strings on a terminator", () => {
    const text = "Alpha\0Bravo\0";
    const bytes = new Uint8Array(text.length * 2);
    for (let i = 0; i < text.length; i++) {
      bytes[i * 2] = text.charCodeAt(i);
      bytes[i * 2 + 1] = 0;
    }

    const parsed = parseBinary(
      toArrayBuffer(buildThin({ sections: [{ name: "__ustring", segname: "__TEXT", data: bytes }] })),
      "utf16-split",
    );
    assert.deepEqual(parsed.slices[0].strings.map((s) => s.value), ["Alpha", "Bravo"]);
  });

  test("keeps a UTF-16 string that ends without a terminator", () => {
    const text = "Trailing";
    const bytes = new Uint8Array(text.length * 2);
    for (let i = 0; i < text.length; i++) {
      bytes[i * 2] = text.charCodeAt(i);
      bytes[i * 2 + 1] = 0;
    }

    const parsed = parseBinary(
      toArrayBuffer(buildThin({ sections: [{ name: "__ustring", segname: "__TEXT", data: bytes }] })),
      "utf16-edge",
    );
    assert.deepEqual(parsed.slices[0].strings.map((s) => s.value), [text]);
  });

  test("falls back to a whole-slice scan when there are no text sections", () => {
    const parsed = parseBinary(
      toArrayBuffer(
        buildThin({
          sections: [
            { name: "__data", segname: "__DATA", data: new TextEncoder().encode("\0fallback-string\0") },
          ],
        }),
      ),
      "fallback",
    );
    const values = parsed.slices[0].strings.map((s) => s.value);
    assert.ok(values.includes("fallback-string"));
  });

  test("decodes 32-bit big-endian headers", () => {
    const parsed = parseBinary(
      toArrayBuffer(buildThin({ is64: false, le: false, cpu: 18, subtype: 0 })),
      "ppc32",
    );
    const slice = parsed.slices[0];
    assert.equal(slice.is64, false);
    assert.equal(slice.le, false);
    assert.equal(slice.cpuName, "ppc");
  });

  test("decodes 32-bit headers", () => {
    const parsed = parseBinary(
      toArrayBuffer(buildThin({ is64: false, cpu: 12, subtype: 9, dylibs: [{ name: "/usr/lib/libSystem.B.dylib", current: packVersion(1), compatibility: packVersion(1) }] })),
      "32bit",
    );
    const slice = parsed.slices[0];
    assert.equal(slice.is64, false);
    assert.equal(slice.cpuName, "arm");
    assert.equal(slice.subtypeName, "v7");
    assert.equal(slice.segments.length, 1);
    assert.equal(slice.dylibs[0].name, "/usr/lib/libSystem.B.dylib");
  });

  test("decodes big-endian headers", () => {
    const parsed = parseBinary(
      toArrayBuffer(buildThin({ le: false, cpu: 18, subtype: 0, dylibs: [{ name: "/usr/lib/libSystem.B.dylib", current: packVersion(1), compatibility: packVersion(1) }] })),
      "ppc",
    );
    const slice = parsed.slices[0];
    assert.equal(slice.le, false);
    assert.equal(slice.cpuName, "ppc");
    assert.equal(slice.dylibs[0].name, "/usr/lib/libSystem.B.dylib");
  });
});

describe("code signature", () => {
  test("finds the superblob and its members", () => {
    const parsed = parseBinary(toArrayBuffer(sample()), "sig");
    const sig = parsed.slices[0].codeSignature;
    assert.ok(sig);
    assert.equal(sig.superBlobMagic, "CSMAGIC_EMBEDDED_SIGNATURE");
    assert.deepEqual(sig.blobs.map((b) => b.typeName), ["CodeDirectory", "Entitlements"]);
  });

  test("reads the code directory identity", () => {
    const parsed = parseBinary(toArrayBuffer(sample()), "cd");
    const cd = parsed.slices[0].codeSignature?.codeDirectory;
    assert.ok(cd);
    assert.equal(cd.identifier, "com.example.test");
    assert.equal(cd.teamId, "GYZJYS7XUG");
    assert.equal(cd.hashType, "SHA-256");
    assert.equal(cd.hashSize, 32);
    assert.equal(cd.pageSize, 4096);
    assert.equal(cd.codeSlots, 4);
    assert.equal(cd.specialSlots, 2);
    assert.equal(cd.codeLimit, 4096);
  });

  test("extracts entitlements XML as text", () => {
    const parsed = parseBinary(toArrayBuffer(sample()), "ents");
    const xml = parsed.slices[0].codeSignature?.entitlementsXml;
    assert.ok(xml);
    assert.ok(xml.startsWith("<?xml"));
    assert.ok(xml.includes("<key>com.apple.security.app-sandbox</key>"));
    assert.ok(xml.includes("<key>com.apple.security.network.client</key>"));
    assert.ok(xml.endsWith("</plist>"));
  });

  test("returns no entitlements when the blob is absent", () => {
    const parsed = parseBinary(toArrayBuffer(buildThin({ includeSignature: true })), "noents");
    assert.ok(parsed.slices[0].codeSignature);
    assert.equal(parsed.slices[0].codeSignature?.entitlementsXml, null);
  });

  test("reports no signature when the command is missing", () => {
    const parsed = parseBinary(toArrayBuffer(buildThin({})), "unsigned");
    assert.equal(parsed.slices[0].codeSignature, null);
  });
});

describe("fat binaries", () => {
  test("reads both architectures and their offsets", () => {
    const x86 = buildThin({ cpu: 0x01000007, subtype: 3, uuid: "11111111111111111111111111111111" });
    const arm = buildThin({ cpu: 0x0100000c, subtype: 2, uuid: "22222222222222222222222222222222" });
    const fat = buildFat([
      { cpu: 0x01000007, subtype: 3, bytes: x86 },
      { cpu: 0x0100000c, subtype: 2, bytes: arm },
    ]);

    const parsed = parseBinary(toArrayBuffer(fat), "fat");
    assert.equal(parsed.container, "fat");
    assert.equal(parsed.fatArchCount, 2);
    assert.equal(parsed.slices.length, 2);
    assert.deepEqual(parsed.slices.map((s) => s.cpuName), ["x86_64", "arm64"]);
    assert.deepEqual(parsed.slices.map((s) => s.uuid), [
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
    ]);
    assert.equal(parsed.slices[0].offset, 0x4000);
    assert.ok(parsed.slices[1].offset > parsed.slices[0].offset);
  });

  test("reads a 64-bit fat header", () => {
    const arm = buildThin({ cpu: 0x0100000c, subtype: 2 });
    const fat = buildFat([{ cpu: 0x0100000c, subtype: 2, bytes: arm }], true);
    const parsed = parseBinary(toArrayBuffer(fat), "fat64");
    assert.equal(parsed.slices.length, 1);
    assert.equal(parsed.slices[0].cpuName, "arm64");
  });
});
