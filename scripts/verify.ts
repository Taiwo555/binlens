/**
 * Runs the parser against real binaries from the command line.
 * Usage: node scripts/verify.ts /bin/cat /usr/sbin/netstat ...
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { parseBinary } from "../src/lib/macho/parse.ts";

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

for (const path of process.argv.slice(2)) {
  const raw = readFileSync(path);
  const parsed = parseBinary(toArrayBuffer(raw), basename(path));

  console.log(`\n${"=".repeat(70)}`);
  console.log(`${path}   ${(raw.byteLength / 1024).toFixed(1)} KB   container=${parsed.container} slices=${parsed.fatArchCount}`);
  if (parsed.warnings.length) console.log("warnings:", parsed.warnings);

  for (const s of parsed.slices) {
    console.log(
      `\n  slice ${s.index}: ${s.cpuName}${s.subtypeName ? "/" + s.subtypeName : ""}  ${s.is64 ? "64-bit" : "32-bit"}  ${s.le ? "LE" : "BE"}  ${s.filetypeName}`,
    );
    console.log(`  offset=0x${s.offset.toString(16)} size=0x${s.size.toString(16)} ncmds=${s.ncmds} sizeofcmds=${s.sizeofcmds}`);
    console.log(`  uuid=${s.uuid ?? "none"}  build=${s.buildVersion?.platform ?? s.minOs?.platform ?? "?"} ${s.buildVersion?.minos ?? s.minOs?.minos ?? ""}`);
    console.log(`  sourceVersion=${s.sourceVersion ?? "-"}  flags=${s.flagNames.join(",") || "none"}`);
    console.log(`  segments=${s.segments.length} sections=${s.sections.length} dylibs=${s.dylibs.length} rpaths=${s.rpaths.length} strings=${s.strings.length}`);

    console.log("  segments:");
    for (const seg of s.segments) {
      console.log(
        `    ${seg.name.padEnd(12)} vm=0x${seg.vmaddr.toString(16).padStart(9, "0")} file=0x${seg.fileoff.toString(16)}+0x${seg.filesize.toString(16)} prot=${seg.initprot}/${seg.maxprot} sections=${seg.sections.length}`,
      );
    }

    const text = s.segments.find((seg) => seg.name === "__TEXT");
    if (text) {
      console.log("  __TEXT sections:");
      for (const sec of text.sections) {
        console.log(`    ${sec.name.padEnd(20)} size=0x${sec.size.toString(16)} off=0x${sec.offset.toString(16)} ${sec.typeName}`);
      }
    }

    if (s.dylibs.length) {
      console.log("  linked libraries:");
      for (const d of s.dylibs.slice(0, 12)) {
        console.log(`    ${d.kind.padEnd(20)} ${d.name}  (${d.currentVersion})`);
      }
      if (s.dylibs.length > 12) console.log(`    ... ${s.dylibs.length - 12} more`);
    }

    if (s.rpaths.length) console.log("  rpaths:", s.rpaths.join(", "));

    if (s.entryPoint) console.log(`  entrypoint: file offset 0x${s.entryPoint.fileOffset.toString(16)}`);

    if (s.codeSignature) {
      const sig = s.codeSignature;
      console.log(`  code signature: ${sig.superBlobMagic} size=0x${sig.size.toString(16)} blobs=${sig.blobs.length}`);
      for (const b of sig.blobs) console.log(`    ${b.typeName.padEnd(20)} ${b.magic} len=${b.length}`);
      const cd = sig.codeDirectory;
      if (cd) {
        console.log(`    identifier="${cd.identifier}" team="${cd.teamId}" hash=${cd.hashType} pageSize=${cd.pageSize} slots=${cd.codeSlots}+${cd.specialSlots}`);
      }
      if (sig.entitlementsXml) {
        console.log("    ENTITLEMENTS:");
        console.log(
          sig.entitlementsXml
            .split("\n")
            .map((l) => "      " + l)
            .join("\n"),
        );
      }
    } else {
      console.log("  code signature: none");
    }

    console.log("  first strings:");
    for (const str of s.strings.slice(0, 5)) {
      console.log(`    [${str.segname},${str.section}] "${str.value.slice(0, 60)}"`);
    }
  }
}
