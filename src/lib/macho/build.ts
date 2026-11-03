/**
 * Builds synthetic Mach-O files byte by byte.
 *
 * Fixtures are generated rather than committed, so the repository carries no
 * binary blobs and every field a test asserts on is visible in the test itself.
 */

function align(v: number, n: number): number {
  return Math.ceil(v / n) * n;
}

class Writer {
  readonly bytes: Uint8Array;
  private readonly view: DataView;
  private readonly le: boolean;
  private pos = 0;

  constructor(size: number, le: boolean) {
    this.bytes = new Uint8Array(size);
    this.view = new DataView(this.bytes.buffer);
    this.le = le;
  }

  at(): number {
    return this.pos;
  }

  seek(v: number): void {
    this.pos = v;
  }

  u8(v: number): void {
    this.view.setUint8(this.pos, v);
    this.pos += 1;
  }

  u32(v: number): void {
    this.view.setUint32(this.pos, v >>> 0, this.le);
    this.pos += 4;
  }

  u64(v: number): void {
    this.view.setBigUint64(this.pos, BigInt(v), this.le);
    this.pos += 8;
  }

  raw(data: Uint8Array): void {
    this.bytes.set(data, this.pos);
    this.pos += data.length;
  }

  /** NUL-padded fixed-width name field, e.g. a 16-byte segname. */
  name16(value: string): void {
    const encoded = new TextEncoder().encode(value);
    const field = new Uint8Array(16);
    field.set(encoded.subarray(0, 16));
    this.raw(field);
  }

  zero(n: number): void {
    this.pos += n;
  }
}

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export interface SectionSpec {
  name: string;
  segname: string;
  data: Uint8Array;
  flags?: number;
  align?: number;
}

export interface DylibSpec {
  name: string;
  current: number;
  compatibility: number;
  cmd?: number;
}

export interface BuildOptions {
  is64?: boolean;
  le?: boolean;
  cpu?: number;
  subtype?: number;
  filetype?: number;
  flags?: number;
  sections?: SectionSpec[];
  dylibs?: DylibSpec[];
  rpath?: string;
  uuid?: string;
  buildVersion?: { platform: number; minos: number; sdk: number; tools?: { tool: number; version: number }[] };
  sourceVersion?: number;
  entryPoint?: { entryoff: number; stacksize: number };
  symtab?: { symoff: number; nsyms: number; stroff: number; strsize: number };
  entitlementsXml?: string;
  identifier?: string;
  teamId?: string;
  includeSignature?: boolean;
  /** Deliberately corrupt the header to exercise bounds checks. */
  overrideNcmds?: number;
  overrideSizeofcmds?: number;
}

const LC_SEGMENT = 0x1;
const LC_SEGMENT_64 = 0x19;
const LC_SYMTAB = 0x2;
const LC_LOAD_DYLIB = 0xc;
const LC_UUID = 0x1b;
const LC_CODE_SIGNATURE = 0x1d;
const LC_MAIN = 0x80000028;
const LC_RPATH = 0x8000001c;
const LC_SOURCE_VERSION = 0x2a;
const LC_BUILD_VERSION = 0x32;

const CSMAGIC_CODEDIRECTORY = 0xfade0c02;
const CSMAGIC_EMBEDDED_ENTITLEMENTS = 0xfade7171;

function dylibCommand(spec: DylibSpec, le: boolean): Uint8Array {
  const nameBytes = encode(spec.name + "\0");
  const size = align(24 + nameBytes.length, 8);
  const w = new Writer(size, le);
  w.u32(spec.cmd ?? LC_LOAD_DYLIB);
  w.u32(size);
  w.u32(24);
  w.u32(0);
  w.u32(spec.current);
  w.u32(spec.compatibility);
  w.seek(24);
  w.raw(nameBytes);
  return w.bytes;
}

function rpathCommand(path: string, le: boolean): Uint8Array {
  const pathBytes = encode(path + "\0");
  const size = align(12 + pathBytes.length, 8);
  const w = new Writer(size, le);
  w.u32(LC_RPATH);
  w.u32(size);
  w.u32(12);
  w.seek(12);
  w.raw(pathBytes);
  return w.bytes;
}

function uuidCommand(hex: string, le: boolean): Uint8Array {
  const w = new Writer(24, le);
  w.u32(LC_UUID);
  w.u32(24);
  for (let i = 0; i < 16; i++) w.u8(parseInt(hex.slice(i * 2, i * 2 + 2), 16));
  return w.bytes;
}

function buildVersionCommand(
  spec: { platform: number; minos: number; sdk: number; tools?: { tool: number; version: number }[] },
  le: boolean,
): Uint8Array {
  const tools = spec.tools ?? [];
  const size = 24 + tools.length * 8;
  const w = new Writer(size, le);
  w.u32(LC_BUILD_VERSION);
  w.u32(size);
  w.u32(spec.platform);
  w.u32(spec.minos);
  w.u32(spec.sdk);
  w.u32(tools.length);
  for (const tool of tools) {
    w.u32(tool.tool);
    w.u32(tool.version);
  }
  return w.bytes;
}

function mainCommand(entryoff: number, stacksize: number, le: boolean): Uint8Array {
  const w = new Writer(24, le);
  w.u32(LC_MAIN);
  w.u32(24);
  w.u64(entryoff);
  w.u64(stacksize);
  return w.bytes;
}

function symtabCommand(spec: { symoff: number; nsyms: number; stroff: number; strsize: number }, le: boolean): Uint8Array {
  const w = new Writer(24, le);
  w.u32(LC_SYMTAB);
  w.u32(24);
  w.u32(spec.symoff);
  w.u32(spec.nsyms);
  w.u32(spec.stroff);
  w.u32(spec.strsize);
  return w.bytes;
}

function codeSignatureCommand(dataoff: number, datasize: number, le: boolean): Uint8Array {
  const w = new Writer(16, le);
  w.u32(LC_CODE_SIGNATURE);
  w.u32(16);
  w.u32(dataoff);
  w.u32(datasize);
  return w.bytes;
}

function segmentCommand(
  name: string,
  sections: { spec: SectionSpec; offset: number; addr: number }[],
  fileoff: number,
  filesize: number,
  is64: boolean,
  le: boolean,
): Uint8Array {
  const headerSize = is64 ? 72 : 56;
  const sectionSize = is64 ? 80 : 68;
  const size = headerSize + sections.length * sectionSize;
  const w = new Writer(size, le);

  w.u32(is64 ? LC_SEGMENT_64 : LC_SEGMENT);
  w.u32(size);
  w.name16(name);
  if (is64) {
    w.u64(0x100000000);
    w.u64(filesize);
  } else {
    w.u32(0x10000000);
    w.u32(filesize);
  }
  if (is64) {
    w.u64(fileoff);
    w.u64(filesize);
  } else {
    w.u32(fileoff);
    w.u32(filesize);
  }
  w.u32(7);
  w.u32(5);
  w.u32(sections.length);
  w.u32(0);

  for (const { spec, offset, addr } of sections) {
    w.name16(spec.name);
    w.name16(spec.segname);
    if (is64) {
      w.u64(addr);
      w.u64(spec.data.length);
    } else {
      w.u32(addr);
      w.u32(spec.data.length);
    }
    w.u32(offset);
    w.u32(spec.align ?? 0);
    w.u32(0);
    w.u32(0);
    w.u32(spec.flags ?? 0);
    w.u32(0);
    w.u32(0);
    if (is64) w.u32(0);
  }

  return w.bytes;
}

function be32(v: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, v >>> 0, false);
  return b;
}

function codeDirectory(opts: BuildOptions): Uint8Array {
  const identifier = encode((opts.identifier ?? "com.example.test") + "\0");
  const team = opts.teamId ? encode(opts.teamId + "\0") : new Uint8Array(0);

  const base = 56;
  const identOffset = base;
  const teamOffset = team.length ? base + identifier.length : 0;
  const total = align(base + identifier.length + team.length, 4);

  const w = new Writer(total, false);
  w.u32(CSMAGIC_CODEDIRECTORY);
  w.u32(total);
  w.u32(0x20200);
  w.u32(0);
  w.u32(0);
  w.u32(identOffset);
  w.u32(2);
  w.u32(4);
  w.u32(4096);
  w.u8(32);
  w.u8(2);
  w.u8(0);
  w.u8(12);
  w.u32(0);
  w.u32(0);
  w.u32(teamOffset);
  w.u32(0);
  w.u32(0);
  w.seek(identOffset);
  w.raw(identifier);
  if (team.length) w.raw(team);

  return w.bytes;
}

function entitlementsBlob(xml: string): Uint8Array {
  const payload = encode(xml);
  const total = align(8 + payload.length, 4);
  const w = new Writer(total, false);
  w.u32(CSMAGIC_EMBEDDED_ENTITLEMENTS);
  w.u32(total);
  w.raw(payload);
  return w.bytes;
}

function signatureSuperBlob(opts: BuildOptions): Uint8Array {
  const blobs: { type: number; bytes: Uint8Array }[] = [];
  blobs.push({ type: 0, bytes: codeDirectory(opts) });
  if (opts.entitlementsXml) blobs.push({ type: 5, bytes: entitlementsBlob(opts.entitlementsXml) });

  const headerSize = 12 + blobs.length * 8;
  let cursor = headerSize;
  const offsets: number[] = [];
  for (const blob of blobs) {
    offsets.push(cursor);
    cursor += blob.bytes.length;
  }

  const total = cursor;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0xfade0cc0, false);
  view.setUint32(4, total, false);
  view.setUint32(8, blobs.length, false);

  blobs.forEach((blob, i) => {
    view.setUint32(12 + i * 8, blob.type, false);
    view.setUint32(16 + i * 8, offsets[i], false);
    out.set(blob.bytes, offsets[i]);
  });

  return out;
}

export function buildThin(opts: BuildOptions = {}): Uint8Array {
  const is64 = opts.is64 ?? true;
  const le = opts.le ?? true;
  const cpu = opts.cpu ?? 0x0100000c;
  const subtype = opts.subtype ?? 2;
  const filetype = opts.filetype ?? 2;
  const headerFlags = opts.flags ?? 0x00200085;

  const sections = opts.sections ?? [
    { name: "__text", segname: "__TEXT", data: encode("\x55\x48\x89\xe5\xc3\x00\x00\x00"), flags: 0x80000400 },
    { name: "__cstring", segname: "__TEXT", data: encode("hello\0world\0"), flags: 0x2 },
  ];

  const dylibs = opts.dylibs ?? [];
  const signature = opts.includeSignature || opts.entitlementsXml ? signatureSuperBlob(opts) : null;

  const headerSize = is64 ? 32 : 28;
  const sectionSize = is64 ? 80 : 68;
  const segmentSize = (is64 ? 72 : 56) + sections.length * sectionSize;

  let commandsSize = segmentSize;
  for (const dylib of dylibs) {
    commandsSize += align(24 + encode(dylib.name + "\0").length, 8);
  }
  if (opts.rpath) commandsSize += align(12 + encode(opts.rpath + "\0").length, 8);
  if (opts.uuid) commandsSize += 24;
  if (opts.buildVersion) commandsSize += 24 + (opts.buildVersion.tools?.length ?? 0) * 8;
  if (opts.sourceVersion !== undefined) commandsSize += 16;
  if (opts.entryPoint) commandsSize += 24;
  if (opts.symtab) commandsSize += 24;
  if (signature) commandsSize += 16;

  const dataStart = align(headerSize + commandsSize, 16);

  const placed: { spec: SectionSpec; offset: number; addr: number }[] = [];
  let dataCursor = dataStart;
  let addrCursor = 0x100000400;
  for (const spec of sections) {
    const offset = spec.data.length ? dataCursor : 0;
    placed.push({ spec, offset, addr: addrCursor });
    dataCursor = align(dataCursor + spec.data.length, 8);
    addrCursor += align(spec.data.length, 8);
  }
  const dataEnd = dataCursor;

  const signatureOffset = signature ? align(dataEnd, 16) : 0;
  const totalSize = signature ? signatureOffset + signature.length : dataEnd;

  const w = new Writer(totalSize, le);
  const file = w.bytes;

  // --- header ---
  w.u32(is64 ? (le ? 0xfeedfacf : 0xfeedfacf) : le ? 0xfeedface : 0xfeedface);
  w.u32(cpu);
  w.u32(subtype);
  w.u32(filetype);
  w.u32(opts.overrideNcmds ?? (1 + dylibs.length + (opts.rpath ? 1 : 0) + (opts.uuid ? 1 : 0) + (opts.buildVersion ? 1 : 0) + (opts.sourceVersion !== undefined ? 1 : 0) + (opts.entryPoint ? 1 : 0) + (opts.symtab ? 1 : 0) + (signature ? 1 : 0)));
  w.u32(opts.overrideSizeofcmds ?? commandsSize);
  w.u32(headerFlags);
  if (is64) w.u32(0);

  // Magic must be written in the file's own byte order. Writer used the same
  // endianness for the header, so rewrite the magic explicitly.
  if (le) {
    new DataView(file.buffer).setUint32(0, is64 ? 0xfeedfacf : 0xfeedface, true);
  } else {
    new DataView(file.buffer).setUint32(0, is64 ? 0xfeedfacf : 0xfeedface, false);
  }
  w.seek(headerSize);

  // --- load commands ---
  w.raw(segmentCommand("__TEXT", placed, 0, dataEnd, is64, le));

  for (const dylib of dylibs) w.raw(dylibCommand(dylib, le));
  if (opts.rpath) w.raw(rpathCommand(opts.rpath, le));
  if (opts.uuid) w.raw(uuidCommand(opts.uuid, le));
  if (opts.buildVersion) w.raw(buildVersionCommand(opts.buildVersion, le));

  if (opts.sourceVersion !== undefined) {
    w.u32(LC_SOURCE_VERSION);
    w.u32(16);
    w.u64(opts.sourceVersion);
  }
  if (opts.entryPoint) w.raw(mainCommand(opts.entryPoint.entryoff, opts.entryPoint.stacksize, le));
  if (opts.symtab) w.raw(symtabCommand(opts.symtab, le));
  if (signature) w.raw(codeSignatureCommand(signatureOffset, signature.length, le));

  // --- section data ---
  for (const entry of placed) {
    if (entry.spec.data.length && entry.offset) {
      file.set(entry.spec.data, entry.offset);
    }
  }

  if (signature) file.set(signature, signatureOffset);

  return file;
}

export interface FatPart {
  cpu: number;
  subtype: number;
  bytes: Uint8Array;
}

/** Wraps slices in a big-endian fat header, the layout Apple ships. */
export function buildFat(parts: FatPart[], is64Fat = false): Uint8Array {
  const entrySize = is64Fat ? 32 : 20;
  const headerSize = 8 + parts.length * entrySize;
  let cursor = align(headerSize, 0x4000);

  const offsets: number[] = [];
  for (const part of parts) {
    offsets.push(cursor);
    cursor = align(cursor + part.bytes.length, 0x4000);
  }

  const out = new Uint8Array(cursor);
  const view = new DataView(out.buffer);

  view.setUint32(0, is64Fat ? 0xcafebabf : 0xcafebabe, false);
  view.setUint32(4, parts.length, false);

  parts.forEach((part, i) => {
    const at = 8 + i * entrySize;
    if (is64Fat) {
      view.setUint32(at, part.cpu, false);
      view.setUint32(at + 4, part.subtype, false);
      view.setBigUint64(at + 8, BigInt(offsets[i]), false);
      view.setBigUint64(at + 16, BigInt(part.bytes.length), false);
      view.setUint32(at + 24, 14, false);
      view.setUint32(at + 28, 0, false);
    } else {
      view.setUint32(at, part.cpu, false);
      view.setUint32(at + 4, part.subtype, false);
      view.setUint32(at + 8, offsets[i], false);
      view.setUint32(at + 12, part.bytes.length, false);
      view.setUint32(at + 16, 14, false);
    }
    out.set(part.bytes, offsets[i]);
  });

  return out;
}

export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/** Packs a Mach-O version field: major.minor.patch. */
export function packVersion(major: number, minor = 0, patch = 0): number {
  return ((major & 0xffff) << 16) | ((minor & 0xff) << 8) | (patch & 0xff);
}

export { be32 };
