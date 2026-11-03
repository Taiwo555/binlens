import { buildFat, buildThin, packVersion } from "./macho/build.ts";

const ENTITLEMENTS = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>com.apple.security.app-sandbox</key>
	<true/>
	<key>com.apple.security.network.client</key>
	<true/>
	<key>com.apple.security.files.user-selected.read-write</key>
	<true/>
	<key>com.apple.developer.team-identifier</key>
	<string>LENS123456</string>
</dict>
</plist>`;

function utf16(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length * 2);
  for (let i = 0; i < text.length; i++) {
    bytes[i * 2] = text.charCodeAt(i) & 0xff;
    bytes[i * 2 + 1] = text.charCodeAt(i) >> 8;
  }
  return bytes;
}

function ascii(...lines: string[]): Uint8Array {
  return new TextEncoder().encode(lines.map((line) => line + "\0").join(""));
}

function machineCode(count: number): Uint8Array {
  // A repeating plausible instruction sequence, not a real function.
  const bytes = new Uint8Array(count);
  for (let i = 0; i < count; i++) bytes[i] = i % 4 === 0 ? 0x55 : i % 7 === 0 ? 0xc3 : 0x90;
  return bytes;
}

interface SliceOptions {
  cpu: number;
  subtype: number;
  uuid: string;
  entryoff: number;
}

function slice(options: SliceOptions): Uint8Array {
  return buildThin({
    cpu: options.cpu,
    subtype: options.subtype,
    uuid: options.uuid,
    sections: [
      { name: "__text", segname: "__TEXT", data: machineCode(0x9a0), flags: 0x80000400 },
      { name: "__objc_methname", segname: "__TEXT", data: ascii("viewDidLoad", "initWithFrame:", "sendTransfer:to:"), flags: 0x2 },
      { name: "__cstring", segname: "__TEXT", data: ascii("binlens sample binary", "Transfer complete", "Insufficient funds"), flags: 0x2 },
      { name: "__ustring", segname: "__TEXT", data: utf16("Available balance\0"), flags: 0x0 },
      { name: "__const", segname: "__TEXT", data: ascii("@(#)PROGRAM:Sample  PROJECT:binlens-1"), flags: 0x0 },
    ],
    dylibs: [
      { name: "/usr/lib/libSystem.B.dylib", current: packVersion(1319), compatibility: packVersion(1) },
      { name: "/usr/lib/libobjc.A.dylib", current: packVersion(228, 0, 4), compatibility: packVersion(1) },
      { name: "/System/Library/Frameworks/CoreFoundation.framework/Versions/A/CoreFoundation", current: packVersion(1979, 3, 0), compatibility: packVersion(150) },
      { name: "/System/Library/Frameworks/Foundation.framework/Versions/C/Foundation", current: packVersion(1979), compatibility: packVersion(300) },
    ],
    rpath: "@executable_path/../Frameworks",
    buildVersion: {
      platform: 1,
      minos: packVersion(14, 2),
      sdk: packVersion(14, 4),
      tools: [{ tool: 1, version: packVersion(15, 0, 0) }],
    },
    sourceVersion: 0x00009a0000000000,
    entryPoint: { entryoff: options.entryoff, stacksize: 0 },
    symtab: { symoff: 0x4000, nsyms: 96, stroff: 0x6000, strsize: 2048 },
    entitlementsXml: ENTITLEMENTS,
    identifier: "com.binlens.sample",
    teamId: "LENS123456",
  });
}

/**
 * Builds the binary shown by "Try a sample". Generating it in code keeps the
 * repository free of binary blobs and makes every field visible below
 * something you can inspect in the source.
 */
export function sampleBinary(): { bytes: Uint8Array; fileName: string } {
  const x86 = slice({
    cpu: 0x01000007,
    subtype: 3,
    uuid: "8f2a5c1d9e4b3a6f8c7d2e1b0a9f4c3d",
    entryoff: 0x3514,
  });
  const arm = slice({
    cpu: 0x0100000c,
    subtype: 2,
    uuid: "1c4d7e9a2b6f4d8c0e3a5b7d9f1c2e4a",
    entryoff: 0x3304,
  });

  return {
    bytes: buildFat([
      { cpu: 0x01000007, subtype: 3, bytes: x86 },
      { cpu: 0x0100000c, subtype: 2, bytes: arm },
    ]),
    fileName: "Sample.app/Contents/MacOS/Sample",
  };
}
