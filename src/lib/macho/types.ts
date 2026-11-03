export interface Section {
  index: number;
  name: string;
  segname: string;
  addr: number;
  size: number;
  offset: number;
  align: number;
  flags: number;
  /** Section type nibble from the low byte of flags, e.g. "S_CSTRING_LITERALS". */
  typeName: string;
}

export interface Segment {
  name: string;
  vmaddr: number;
  vmsize: number;
  fileoff: number;
  filesize: number;
  maxprot: number;
  initprot: number;
  flags: number;
  sections: Section[];
}

export interface DylibRef {
  kind: string;
  name: string;
  currentVersion: string;
  compatibilityVersion: string;
  timestamp: number;
}

export interface LoadCommandInfo {
  index: number;
  cmd: number;
  name: string;
  cmdsize: number;
  /** Offset of the command within the file. */
  offset: number;
  /** One-line human summary shown in the command list. */
  summary: string;
}

export interface BuildVersion {
  platform: string;
  minos: string;
  sdk: string;
  tools: { tool: string; version: string }[];
}

export interface SignatureBlob {
  type: number;
  typeName: string;
  offset: number;
  length: number;
  magic: string;
}

export interface CodeDirectoryInfo {
  version: number;
  flags: number;
  identifier: string;
  teamId: string;
  hashType: string;
  hashSize: number;
  pageSize: number;
  codeSlots: number;
  specialSlots: number;
  codeLimit: number;
}

export interface CodeSignature {
  fileOffset: number;
  size: number;
  superBlobMagic: string;
  blobs: SignatureBlob[];
  codeDirectory: CodeDirectoryInfo | null;
  entitlementsXml: string | null;
  infoPlistXml: string | null;
  requirementsPresent: boolean;
}

export interface StringHit {
  value: string;
  section: string;
  segname: string;
  fileOffset: number;
}

export interface SymbolTableInfo {
  symtabOffset: number;
  symbols: number;
  stringBytes: number;
}

export interface Slice {
  index: number;
  offset: number;
  size: number;
  is64: boolean;
  le: boolean;
  cputype: number;
  cpusubtype: number;
  cpuName: string;
  subtypeName: string;
  filetype: number;
  filetypeName: string;
  ncmds: number;
  sizeofcmds: number;
  flags: number;
  flagNames: string[];
  segments: Segment[];
  sections: Section[];
  dylibs: DylibRef[];
  rpaths: string[];
  loadCommands: LoadCommandInfo[];
  uuid: string | null;
  entryPoint: { fileOffset: number; stackSize: number } | null;
  sourceVersion: string | null;
  buildVersion: BuildVersion | null;
  minOs: { platform: string; minos: string; sdk: string } | null;
  codeSignature: CodeSignature | null;
  symtab: SymbolTableInfo | null;
  strings: StringHit[];
  encrypted: { cryptoff: number; cryptsize: number; cryptid: number } | null;
}

export interface ParsedBinary {
  fileName: string;
  fileSize: number;
  container: "thin" | "fat";
  fatArchCount: number;
  slices: Slice[];
  warnings: string[];
}
