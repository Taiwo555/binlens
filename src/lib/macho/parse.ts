import {
  CPU_SUBTYPES,
  CPU_TYPES,
  DYLIB_CMDS,
  FAT_CIGAM,
  FAT_CIGAM_64,
  FAT_MAGIC,
  FAT_MAGIC_64,
  FILE_TYPES,
  HEADER_FLAGS,
  LC_NAMES,
  MH_CIGAM,
  MH_CIGAM_64,
  MH_MAGIC,
  MH_MAGIC_64,
  PLATFORMS,
} from "./constants.ts";
import { Reader, formatVersion } from "./reader.ts";
import { parseCodeSignature } from "./signature.ts";
import { extractStrings, extractStringsFromRange } from "./strings.ts";
import type {
  BuildVersion,
  DylibRef,
  LoadCommandInfo,
  ParsedBinary,
  Section,
  Segment,
  Slice,
  StringHit,
} from "./types.ts";

const MAX_SLICES = 32;
const MAX_LOAD_COMMANDS = 65536;
const MAX_SECTIONS_PER_SEGMENT = 4096;

const SECTION_TYPES: Record<number, string> = {
  0x0: "S_REGULAR",
  0x1: "S_ZEROFILL",
  0x2: "S_CSTRING_LITERALS",
  0x3: "S_4BYTE_LITERALS",
  0x4: "S_8BYTE_LITERALS",
  0x5: "S_LITERAL_POINTERS",
  0x6: "S_NON_LAZY_SYMBOL_POINTERS",
  0x7: "S_LAZY_SYMBOL_POINTERS",
  0x8: "S_SYMBOL_STUBS",
  0x9: "S_MOD_INIT_FUNC_POINTERS",
  0xa: "S_MOD_TERM_FUNC_POINTERS",
  0xb: "S_COALESCED",
  0xc: "S_GB_ZEROFILL",
  0xd: "S_INTERPOSING",
  0xe: "S_16BYTE_LITERALS",
  0xf: "S_DTRACE_DOF",
  0x10: "S_LAZY_DYLIB_SYMBOL_POINTERS",
  0x11: "S_THREAD_LOCAL_REGULAR",
  0x12: "S_THREAD_LOCAL_ZEROFILL",
  0x13: "S_THREAD_LOCAL_VARIABLES",
  0x14: "S_THREAD_LOCAL_VARIABLE_POINTERS",
  0x15: "S_THREAD_LOCAL_INIT_FUNCTION_POINTERS",
  0x16: "S_INIT_FUNC_OFFSETS",
};

const PLATFORM_TOOLS: Record<number, string> = { 1: "clang", 2: "swift", 3: "ld" };

const LCT_LOAD_DYLIB = 0xc;
const LCT_ID_DYLIB = 0xd;
const LCT_LOAD_WEAK_DYLIB = 0x80000018;
const LCT_REEXPORT_DYLIB = 0x8000001f;
const LCT_LAZY_LOAD_DYLIB = 0x20;
const LCT_LOAD_UPWARD_DYLIB = 0x80000023;

const LC_SEGMENT = 0x1;
const LC_SEGMENT_64 = 0x19;
const LC_SYMTAB = 0x2;
const LC_UUID = 0x1b;
const LC_RPATH = 0x8000001c;
const LC_CODE_SIGNATURE = 0x1d;
const LC_MAIN = 0x80000028;
const LC_SOURCE_VERSION = 0x2a;
const LC_BUILD_VERSION = 0x32;
const LC_VERSION_MIN_MACOSX = 0x24;
const LC_VERSION_MIN_IPHONEOS = 0x25;
const LC_VERSION_MIN_TVOS = 0x2f;
const LC_VERSION_MIN_WATCHOS = 0x30;
const LC_ENCRYPTION_INFO = 0x21;
const LC_ENCRYPTION_INFO_64 = 0x2c;

function protString(v: number): string {
  return `${v & 1 ? "r" : "-"}${v & 2 ? "w" : "-"}${v & 4 ? "x" : "-"}`;
}

function cpuName(cputype: number): string {
  return CPU_TYPES[cputype] ?? `cpu 0x${(cputype >>> 0).toString(16)}`;
}

function subtypeName(cputype: number, cpusubtype: number): string {
  const masked = cpusubtype & 0x00ffffff;
  const table = CPU_SUBTYPES[cputype];
  if (!table) return `subtype 0x${(cpusubtype >>> 0).toString(16)}`;
  return table[masked] ?? `subtype 0x${(masked >>> 0).toString(16)}`;
}

function flagNames(flags: number): string[] {
  const names: string[] = [];
  for (const key of Object.keys(HEADER_FLAGS)) {
    const bit = Number(key);
    if ((flags & bit) !== 0 && bit !== 0) names.push(HEADER_FLAGS[bit]);
  }
  return names;
}

function commandName(cmd: number): string {
  return LC_NAMES[cmd] ?? LC_NAMES[cmd & 0x7fffffff] ?? `LC_0x${(cmd >>> 0).toString(16)}`;
}

function isDylibCommand(cmd: number): boolean {
  return (
    cmd === LCT_LOAD_DYLIB ||
    cmd === LCT_ID_DYLIB ||
    cmd === LCT_LOAD_WEAK_DYLIB ||
    cmd === LCT_REEXPORT_DYLIB ||
    cmd === LCT_LAZY_LOAD_DYLIB ||
    cmd === LCT_LOAD_UPWARD_DYLIB
  );
}

function readSection(reader: Reader, at: number, index: number, is64: boolean): Section {
  const name = reader.fixedString(at, 16);
  const segname = reader.fixedString(at + 16, 16);
  const addr = is64 ? reader.u64(at + 32) : reader.u32(at + 32);
  const size = is64 ? reader.u64(at + 40) : reader.u32(at + 36);
  const offsetAt = is64 ? at + 48 : at + 40;
  const flagsAt = is64 ? at + 64 : at + 56;
  const offset = reader.u32(offsetAt);
  const align = reader.u32(offsetAt + 4);
  const flags = reader.u32(flagsAt);

  return {
    index,
    name,
    segname,
    addr,
    size,
    offset,
    align,
    flags,
    typeName: SECTION_TYPES[flags & 0xff] ?? `type 0x${(flags & 0xff).toString(16)}`,
  };
}

interface SliceParseResult {
  slice: Slice | null;
  warnings: string[];
}

function parseSlice(
  buffer: ArrayBuffer,
  base: number,
  size: number,
  index: number,
  is64: boolean,
  le: boolean,
): SliceParseResult {
  const warnings: string[] = [];
  const reader = new Reader(buffer, le);

  const headerSize = is64 ? 32 : 28;
  if (!reader.fits(base, headerSize)) {
    return { slice: null, warnings: ["Slice header runs past the end of the file."] };
  }

  const cputype = reader.u32(base + 4);
  const cpusubtype = reader.u32(base + 8);
  const filetype = reader.u32(base + 12);
  const ncmds = reader.u32(base + 16);
  const sizeofcmds = reader.u32(base + 20);
  const flags = reader.u32(base + 24);

  if (ncmds > MAX_LOAD_COMMANDS) {
    warnings.push(`Header claims ${ncmds} load commands, which is implausible.`);
    return { slice: null, warnings };
  }
  if (sizeofcmds > size) {
    warnings.push(`Header claims ${sizeofcmds} bytes of load commands but the slice is only ${size} bytes.`);
    return { slice: null, warnings };
  }

  const segments: Segment[] = [];
  const sections: Section[] = [];
  const dylibs: DylibRef[] = [];
  const rpaths: string[] = [];
  const loadCommands: LoadCommandInfo[] = [];

  let uuid: string | null = null;
  let entryPoint: Slice["entryPoint"] = null;
  let sourceVersion: string | null = null;
  let buildVersion: BuildVersion | null = null;
  let minOs: Slice["minOs"] = null;
  let signatureRange: { off: number; size: number } | null = null;
  let symtab: Slice["symtab"] = null;
  let encrypted: Slice["encrypted"] = null;

  let cursor = base + headerSize;
  const commandsEnd = cursor + sizeofcmds;

  for (let i = 0; i < ncmds; i++) {
    if (cursor + 8 > commandsEnd) {
      warnings.push(`Load command table ended after ${i} of ${ncmds} commands.`);
      break;
    }

    const cmd = reader.u32(cursor);
    const cmdsize = reader.u32(cursor + 4);
    if (cmdsize < 8 || cursor + cmdsize > commandsEnd) {
      warnings.push(`Load command ${i} declares cmdsize ${cmdsize}, which does not fit.`);
      break;
    }

    const name = commandName(cmd);
    let summary = "";

    if (cmd === LC_SEGMENT || cmd === LC_SEGMENT_64) {
      const seg64 = cmd === LC_SEGMENT_64;
      const segname = reader.fixedString(cursor + 8, 16);
      const vmaddr = seg64 ? reader.u64(cursor + 24) : reader.u32(cursor + 24);
      const vmsize = seg64 ? reader.u64(cursor + 32) : reader.u32(cursor + 28);
      const fileoff = seg64 ? reader.u64(cursor + 40) : reader.u32(cursor + 32);
      const filesize = seg64 ? reader.u64(cursor + 48) : reader.u32(cursor + 36);
      const maxprot = reader.i32(seg64 ? cursor + 56 : cursor + 40);
      const initprot = reader.i32(seg64 ? cursor + 60 : cursor + 44);
      const nsects = reader.u32(seg64 ? cursor + 64 : cursor + 48);
      const segFlags = reader.u32(seg64 ? cursor + 68 : cursor + 52);

      const segSections: Section[] = [];
      const sectionStart = cursor + (seg64 ? 72 : 56);
      const stride = seg64 ? 80 : 68;
      const maxSections = Math.min(nsects, MAX_SECTIONS_PER_SEGMENT);

      for (let s = 0; s < maxSections; s++) {
        const at = sectionStart + s * stride;
        if (at + stride > cursor + cmdsize) break;
        const section = readSection(reader, at, sections.length, seg64);
        segSections.push(section);
        sections.push(section);
      }

      segments.push({
        name: segname,
        vmaddr,
        vmsize,
        fileoff,
        filesize,
        maxprot,
        initprot,
        flags: segFlags,
        sections: segSections,
      });

      summary = `${segname || "(unnamed)"}  vm 0x${vmaddr.toString(16)}  file 0x${fileoff.toString(16)}+0x${filesize.toString(16)}  ${protString(initprot)}  ${segSections.length} section${segSections.length === 1 ? "" : "s"}`;
    } else if (isDylibCommand(cmd)) {
      const nameOffset = reader.u32(cursor + 8);
      if (nameOffset >= 8 && nameOffset < cmdsize) {
        const dylibName = reader.cstring(cursor + nameOffset, cmdsize - nameOffset);
        const current = formatVersion(reader.u32(cursor + 16));
        const compatibility = formatVersion(reader.u32(cursor + 20));
        const timestamp = reader.u32(cursor + 12);
        dylibs.push({
          kind: DYLIB_CMDS[cmd] ?? name,
          name: dylibName,
          currentVersion: current,
          compatibilityVersion: compatibility,
          timestamp,
        });
        summary = dylibName;
      }
    } else if (cmd === LC_RPATH) {
      const pathOffset = reader.u32(cursor + 8);
      if (pathOffset >= 8 && pathOffset < cmdsize) {
        const path = reader.cstring(cursor + pathOffset, cmdsize - pathOffset);
        rpaths.push(path);
        summary = path;
      }
    } else if (cmd === LC_UUID) {
      const bytes = reader.bytes(cursor + 8, 16);
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
      summary = uuid;
    } else if (cmd === LC_MAIN) {
      const entryoff = reader.u64(cursor + 8);
      const stacksize = reader.u64(cursor + 16);
      entryPoint = { fileOffset: entryoff, stackSize: stacksize };
      summary = `entry at file offset 0x${entryoff.toString(16)}  stack 0x${stacksize.toString(16)}`;
    } else if (cmd === LC_CODE_SIGNATURE) {
      const dataoff = reader.u32(cursor + 8);
      const datasize = reader.u32(cursor + 12);
      signatureRange = { off: dataoff, size: datasize };
      summary = `dataoff 0x${dataoff.toString(16)}  size 0x${datasize.toString(16)}`;
    } else if (cmd === LC_SYMTAB) {
      const symoff = reader.u32(cursor + 8);
      const nsyms = reader.u32(cursor + 12);
      const stroff = reader.u32(cursor + 16);
      const strsize = reader.u32(cursor + 20);
      symtab = { symtabOffset: symoff, symbols: nsyms, stringBytes: strsize };
      summary = `${nsyms} symbols, string table at 0x${stroff.toString(16)} (${strsize} bytes)`;
    } else if (cmd === LC_SOURCE_VERSION) {
      // loader.h: "A.B.C.D.E packed as a24.b10.c10.d10.e10"
      const v = reader.u64(cursor + 8);
      const a = Math.floor(v / 0x10000000000) & 0xffffff;
      const b = Math.floor(v / 0x40000000) & 0x3ff;
      const c = Math.floor(v / 0x100000) & 0x3ff;
      const d = Math.floor(v / 0x400) & 0x3ff;
      const e = v & 0x3ff;
      sourceVersion = `${a}.${b}.${c}.${d}.${e}`;
      summary = sourceVersion;
    } else if (cmd === LC_BUILD_VERSION) {
      const platform = reader.u32(cursor + 8);
      const minos = formatVersion(reader.u32(cursor + 12));
      const sdk = formatVersion(reader.u32(cursor + 16));
      const ntools = Math.min(reader.u32(cursor + 20), 8);
      const tools: { tool: string; version: string }[] = [];
      for (let t = 0; t < ntools; t++) {
        const at = cursor + 24 + t * 8;
        if (at + 8 > cursor + cmdsize) break;
        const tool = reader.u32(at);
        tools.push({
          tool: PLATFORM_TOOLS[tool] ?? `tool ${tool}`,
          version: formatVersion(reader.u32(at + 4)),
        });
      }
      buildVersion = {
        platform: PLATFORMS[platform] ?? `platform ${platform}`,
        minos,
        sdk,
        tools: tools.filter((t) => t.tool === "clang" || t.tool === "swift" || t.tool === "ld"),
      };
      summary = `${buildVersion.platform} ${minos}  sdk ${sdk}`;
    } else if (
      cmd === LC_VERSION_MIN_MACOSX ||
      cmd === LC_VERSION_MIN_IPHONEOS ||
      cmd === LC_VERSION_MIN_TVOS ||
      cmd === LC_VERSION_MIN_WATCHOS
    ) {
      const platform =
        cmd === LC_VERSION_MIN_MACOSX
          ? "macOS"
          : cmd === LC_VERSION_MIN_IPHONEOS
            ? "iOS"
            : cmd === LC_VERSION_MIN_TVOS
              ? "tvOS"
              : "watchOS";
      const minos = formatVersion(reader.u32(cursor + 8));
      const sdk = formatVersion(reader.u32(cursor + 12));
      minOs = { platform, minos, sdk };
      summary = `${platform} ${minos}  sdk ${sdk}`;
    } else if (cmd === LC_ENCRYPTION_INFO || cmd === LC_ENCRYPTION_INFO_64) {
      encrypted = {
        cryptoff: reader.u32(cursor + 8),
        cryptsize: reader.u32(cursor + 12),
        cryptid: reader.u32(cursor + 16),
      };
      summary = encrypted.cryptid === 0 ? "not encrypted" : `encrypted (cryptid ${encrypted.cryptid})`;
    } else {
      summary = `cmdsize ${cmdsize}`;
    }

    loadCommands.push({ index: i, cmd, name, cmdsize, offset: cursor, summary });
    cursor += cmdsize;
  }

  const tsig = signatureRange;
  const codeSignature = tsig ? parseCodeSignature(buffer, base + tsig.off, tsig.size) : null;

  let strings: StringHit[] = extractStrings(buffer, sections, base, size);
  if (strings.length === 0) {
    strings = extractStringsFromRange(buffer, base, size, 5000);
  }

  const slice: Slice = {
    index,
    offset: base,
    size,
    is64,
    le,
    cputype,
    cpusubtype,
    cpuName: cpuName(cputype),
    subtypeName: subtypeName(cputype, cpusubtype),
    filetype,
    filetypeName: FILE_TYPES[filetype] ?? `filetype ${filetype}`,
    ncmds,
    sizeofcmds,
    flags,
    flagNames: flagNames(flags),
    segments,
    sections,
    dylibs,
    rpaths,
    loadCommands,
    uuid,
    entryPoint,
    sourceVersion,
    buildVersion,
    minOs,
    codeSignature,
    symtab,
    strings,
    encrypted,
  };

  return { slice, warnings };
}

/** Size of one fat_arch entry, and of one fat_arch_64 entry. */
const FAT_ARCH_SIZE = 20;
const FAT_ARCH_64_SIZE = 32;

export function parseBinary(buffer: ArrayBuffer, fileName: string): ParsedBinary {
  const warnings: string[] = [];
  const fileSize = buffer.byteLength;

  if (fileSize < 4) {
    return { fileName, fileSize, container: "thin", fatArchCount: 0, slices: [], warnings: ["File is too small to contain a header."] };
  }

  const dv = new DataView(buffer);
  const beMagic = dv.getUint32(0, false);
  const leMagic = dv.getUint32(0, true);

  const isFat =
    beMagic === FAT_MAGIC || beMagic === FAT_MAGIC_64 || beMagic === FAT_CIGAM || beMagic === FAT_CIGAM_64;

  if (isFat) {
    const is64Fat = beMagic === FAT_MAGIC_64 || beMagic === FAT_CIGAM_64;
    const bigEndianArches = beMagic === FAT_MAGIC || beMagic === FAT_MAGIC_64;
    const archReader = new Reader(buffer, !bigEndianArches);
    const count = archReader.u32(4);

    if (count === 0 || count > MAX_SLICES) {
      warnings.push(`Fat header claims ${count} architectures. Refusing to parse.`);
      return { fileName, fileSize, container: "fat", fatArchCount: count, slices: [], warnings };
    }

    const entrySize = is64Fat ? FAT_ARCH_64_SIZE : FAT_ARCH_SIZE;
    if (!archReader.fits(8, count * entrySize)) {
      warnings.push("Fat architecture table runs past the end of the file.");
      return { fileName, fileSize, container: "fat", fatArchCount: count, slices: [], warnings };
    }

    const slices: Slice[] = [];
    for (let i = 0; i < count; i++) {
      const at = 8 + i * entrySize;
      const offset = is64Fat ? archReader.u64(at + 8) : archReader.u32(at + 8);
      const size = is64Fat ? archReader.u64(at + 16) : archReader.u32(at + 12);

      if (offset + size > fileSize || size === 0) {
        warnings.push(`Architecture ${i} points outside the file (offset ${offset}, size ${size}).`);
        continue;
      }

      const inner = new Reader(buffer, true).u32(offset);
      let le = true;
      let is64 = false;
      if (inner === MH_MAGIC_64) {
        le = true;
        is64 = true;
      } else if (inner === MH_MAGIC) {
        le = true;
        is64 = false;
      } else if (inner === MH_CIGAM_64) {
        le = false;
        is64 = true;
      } else if (inner === MH_CIGAM) {
        le = false;
        is64 = false;
      } else {
        warnings.push(`Architecture ${i} does not start with a Mach-O magic (0x${inner.toString(16)}).`);
        continue;
      }

      const parsed = parseSlice(buffer, offset, size, i, is64, le);
      warnings.push(...parsed.warnings);
      if (parsed.slice) slices.push(parsed.slice);
    }

    return { fileName, fileSize, container: "fat", fatArchCount: count, slices, warnings };
  }

  let le = true;
  let is64 = false;
  if (leMagic === MH_MAGIC_64) {
    le = true;
    is64 = true;
  } else if (leMagic === MH_MAGIC) {
    le = true;
    is64 = false;
  } else if (leMagic === MH_CIGAM_64) {
    le = false;
    is64 = true;
  } else if (leMagic === MH_CIGAM) {
    le = false;
    is64 = false;
  } else {
    warnings.push(
      `Not a Mach-O file. First four bytes are 0x${beMagic.toString(16).toUpperCase()} — this is not a macOS or iOS binary.`,
    );
    return { fileName, fileSize, container: "thin", fatArchCount: 0, slices: [], warnings };
  }

  const parsed = parseSlice(buffer, 0, fileSize, 0, is64, le);
  warnings.push(...parsed.warnings);

  return {
    fileName,
    fileSize,
    container: "thin",
    fatArchCount: 1,
    slices: parsed.slice ? [parsed.slice] : [],
    warnings,
  };
}
