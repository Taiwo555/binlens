/** Bounds-checked readers over a whole file. All offsets are absolute. */

export class Reader {
  readonly buffer: ArrayBuffer;
  readonly view: DataView;
  readonly le: boolean;

  constructor(buffer: ArrayBuffer, le = true) {
    this.buffer = buffer;
    this.view = new DataView(buffer);
    this.le = le;
  }

  get byteLength(): number {
    return this.buffer.byteLength;
  }

  fits(offset: number, length: number): boolean {
    return offset >= 0 && length >= 0 && offset + length <= this.buffer.byteLength;
  }

  u8(o: number): number {
    return this.view.getUint8(o);
  }

  u16(o: number): number {
    return this.view.getUint16(o, this.le);
  }

  u32(o: number): number {
    return this.view.getUint32(o, this.le);
  }

  i32(o: number): number {
    return this.view.getInt32(o, this.le);
  }

  u64(o: number): number {
    return Number(this.view.getBigUint64(o, this.le));
  }

  bytes(o: number, n: number): Uint8Array {
    return new Uint8Array(this.buffer, o, n);
  }

  /** Fixed-width field, e.g. a 16-byte segment name. Stops at the first NUL. */
  fixedString(o: number, n: number): string {
    let end = o;
    const stop = Math.min(o + n, this.buffer.byteLength);
    while (end < stop && this.view.getUint8(end) !== 0) end++;
    return this.decode(o, end - o);
  }

  /** NUL-terminated string, with a hard cap so a corrupt file cannot spin. */
  cstring(o: number, limit = 1024): string {
    if (!this.fits(o, 1)) return "";
    const stop = Math.min(o + limit, this.buffer.byteLength);
    let end = o;
    while (end < stop && this.view.getUint8(end) !== 0) end++;
    return this.decode(o, end - o);
  }

  decode(o: number, n: number): string {
    if (!this.fits(o, n) || n <= 0) return "";
    const slice = new Uint8Array(this.buffer, o, n);
    return new TextDecoder("utf-8", { fatal: false }).decode(slice);
  }
}

/** Mach-O version fields pack major.minor.patch into one u32. */
export function formatVersion(v: number): string {
  const major = (v >>> 16) & 0xffff;
  const minor = (v >>> 8) & 0xff;
  const patch = v & 0xff;
  return `${major}.${minor}.${patch}`;
}

export function hex(n: number, width = 0): string {
  const s = (n >>> 0).toString(16).toUpperCase();
  return width ? s.padStart(width, "0") : s;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
