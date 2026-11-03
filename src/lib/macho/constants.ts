/** Mach-O constants. Values from <mach-o/loader.h> and <mach-o/fat.h>. */

export const MH_MAGIC = 0xfeedface;
export const MH_CIGAM = 0xcefaedfe;
export const MH_MAGIC_64 = 0xfeedfacf;
export const MH_CIGAM_64 = 0xcffaedfe;

export const FAT_MAGIC = 0xcafebabe;
export const FAT_CIGAM = 0xbebafeca;
export const FAT_MAGIC_64 = 0xcafebabf;
export const FAT_CIGAM_64 = 0xbfbafeca;

export const CPU_TYPES: Record<number, string> = {
  7: "x86",
  0x01000007: "x86_64",
  12: "arm",
  0x0100000c: "arm64",
  0x0200000c: "arm64_32",
  18: "ppc",
  0x01000012: "ppc64",
};

/** Subtype names only make sense within a cpu type. */
export const CPU_SUBTYPES: Record<number, Record<number, string>> = {
  0x0100000c: { 0: "all", 1: "v8", 2: "arm64e" },
  0x01000007: { 0: "all", 3: "all", 8: "h" },
  0x0200000c: { 0: "all", 1: "v8" },
  12: { 0: "all", 5: "v4t", 6: "v6", 7: "v5tej", 8: "xscale", 9: "v7", 10: "v7f", 11: "v7s", 12: "v7k", 13: "v8", 14: "v6m", 15: "v7m", 16: "v7em" },
};

export const FILE_TYPES: Record<number, string> = {
  1: "object",
  2: "executable",
  3: "fixed vm library",
  4: "core",
  5: "preloaded executable",
  6: "dynamic library",
  7: "dynamic linker",
  8: "bundle",
  9: "dynamic library stub",
  10: "dSYM companion",
  11: "kext bundle",
  12: "fileset",
};

export const HEADER_FLAGS: Record<number, string> = {
  0x1: "MH_NOUNDEFS",
  0x2: "MH_INCRLINK",
  0x4: "MH_DYLDLINK",
  0x8: "MH_BINDATLOAD",
  0x10: "MH_PREBOUND",
  0x20: "MH_SPLIT_SEGS",
  0x40: "MH_LAZY_INIT",
  0x80: "MH_TWOLEVEL",
  0x100: "MH_FORCE_FLAT",
  0x200: "MH_NOMULTIDEFS",
  0x400: "MH_NOFIXPREBINDING",
  0x800: "MH_PREBINDABLE",
  0x1000: "MH_ALLMODSBOUND",
  0x2000: "MH_SUBSECTIONS_VIA_SYMBOLS",
  0x4000: "MH_CANONICAL",
  0x8000: "MH_WEAK_DEFINES",
  0x10000: "MH_BINDS_TO_WEAK",
  0x20000: "MH_ALLOW_STACK_EXECUTION",
  0x40000: "MH_ROOT_SAFE",
  0x80000: "MH_SETUID_SAFE",
  0x100000: "MH_NO_REEXPORTED_DYLIBS",
  0x200000: "MH_PIE",
  0x400000: "MH_DEAD_STRIPPABLE_DYLIB",
  0x800000: "MH_HAS_TLV_DESCRIPTORS",
  0x1000000: "MH_NO_HEAP_EXECUTION",
  0x2000000: "MH_APP_EXTENSION_SAFE",
  0x4000000: "MH_NLIST_OUTOFSYNC_WITH_DYLDINFO",
  0x8000000: "MH_SIM_SUPPORT",
  0x80000000: "MH_DYLIB_IN_CACHE",
};

export const LC_NAMES: Record<number, string> = {
  0x1: "LC_SEGMENT",
  0x2: "LC_SYMTAB",
  0x3: "LC_SYMSEG",
  0x4: "LC_THREAD",
  0x5: "LC_UNIXTHREAD",
  0x6: "LC_LOADFVMLIB",
  0x7: "LC_IDFVMLIB",
  0x8: "LC_IDENT",
  0x9: "LC_FVMFILE",
  0xa: "LC_PREPAGE",
  0xb: "LC_DYSYMTAB",
  0xc: "LC_LOAD_DYLIB",
  0xd: "LC_ID_DYLIB",
  0xe: "LC_LOAD_DYLINKER",
  0xf: "LC_ID_DYLINKER",
  0x10: "LC_PREBOUND_DYLIB",
  0x11: "LC_ROUTINES",
  0x12: "LC_SUB_FRAMEWORK",
  0x13: "LC_SUB_UMBRELLA",
  0x14: "LC_SUB_CLIENT",
  0x15: "LC_SUB_LIBRARY",
  0x16: "LC_TWOLEVEL_HINTS",
  0x17: "LC_PREBIND_CKSUM",
  0x19: "LC_SEGMENT_64",
  0x1a: "LC_ROUTINES_64",
  0x1b: "LC_UUID",
  0x1d: "LC_CODE_SIGNATURE",
  0x1e: "LC_SEGMENT_SPLIT_INFO",
  0x20: "LC_LAZY_LOAD_DYLIB",
  0x21: "LC_ENCRYPTION_INFO",
  0x22: "LC_DYLD_INFO",
  0x24: "LC_VERSION_MIN_MACOSX",
  0x25: "LC_VERSION_MIN_IPHONEOS",
  0x26: "LC_FUNCTION_STARTS",
  0x27: "LC_DYLD_ENVIRONMENT",
  0x28: "LC_MAIN",
  0x29: "LC_DATA_IN_CODE",
  0x2a: "LC_SOURCE_VERSION",
  0x2b: "LC_DYLIB_CODE_SIGN_DRS",
  0x2c: "LC_ENCRYPTION_INFO_64",
  0x2d: "LC_LINKER_OPTION",
  0x2e: "LC_LINKER_OPTIMIZATION_HINT",
  0x2f: "LC_VERSION_MIN_TVOS",
  0x30: "LC_VERSION_MIN_WATCHOS",
  0x31: "LC_NOTE",
  0x32: "LC_BUILD_VERSION",
  0x80000018: "LC_LOAD_WEAK_DYLIB",
  0x8000001c: "LC_RPATH",
  0x8000001f: "LC_REEXPORT_DYLIB",
  0x80000022: "LC_DYLD_INFO_ONLY",
  0x80000023: "LC_LOAD_UPWARD_DYLIB",
  0x80000028: "LC_MAIN",
  0x80000033: "LC_DYLD_EXPORTS_TRIE",
  0x80000034: "LC_DYLD_CHAINED_FIXUPS",
  0x80000035: "LC_FILESET_ENTRY",
};

/** Commands whose payload is a dylib struct carrying a file name. */
export const DYLIB_CMDS: Record<number, string> = {
  0xc: "LC_LOAD_DYLIB",
  0xd: "LC_ID_DYLIB",
  0x80000018: "LC_LOAD_WEAK_DYLIB",
  0x8000001f: "LC_REEXPORT_DYLIB",
  0x20: "LC_LAZY_LOAD_DYLIB",
  0x80000023: "LC_LOAD_UPWARD_DYLIB",
};

/** Bit 31 marks the command as "required" in the header; the name lookup strips it. */
export const LC_REQ_DYLD = 0x80000000;

export const PLATFORMS: Record<number, string> = {
  1: "macOS",
  2: "iOS",
  3: "tvOS",
  4: "watchOS",
  5: "bridgeOS",
  6: "macCatalyst",
  7: "iOS Simulator",
  8: "tvOS Simulator",
  9: "watchOS Simulator",
  10: "DriverKit",
  11: "visionOS",
  12: "visionOS Simulator",
};

export const BLOB_TYPES: Record<number, string> = {
  0x00000: "CodeDirectory",
  0x00001: "Info.plist",
  0x00002: "Requirements",
  0x00003: "ResourceDirectory",
  0x00005: "Entitlements",
  0x00007: "DER Entitlements",
  0x00008: "Launch Constraints",
  0x10000: "CMS Signature",
};

export const HASH_TYPES: Record<number, string> = {
  1: "SHA-1",
  2: "SHA-256",
  3: "SHA-256 (truncated)",
  4: "SHA-384",
};
