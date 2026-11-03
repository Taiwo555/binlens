import { BLOB_TYPES, HASH_TYPES } from "./constants.ts";
import type { CodeDirectoryInfo, CodeSignature, SignatureBlob } from "./types.ts";

/**
 * The code signature is a SuperBlob. Unlike the rest of the Mach-O file,
 * every field inside it is big-endian, because the code signing
 * infrastructure is byte-order independent by design.
 */
const CSMAGIC_EMBEDDED_SIGNATURE = 0xfade0cc0;
const CSMAGIC_CODEDIRECTORY = 0xfade0c02;
const CSMAGIC_EMBEDDED_ENTITLEMENTS = 0xfade7171;
const CSMAGIC_EMBEDDED_DER_ENTITLEMENTS = 0xfade7172;
const CSMAGIC_REQUIREMENTS = 0xfade0c01;
const CSMAGIC_BLOBWRAPPER = 0xfade0b01;
const CSMAGIC_EMBEDDED_SIGNATURE_DETACHED = 0xfade0cc1;

function readBeMagic(buffer: ArrayBuffer, offset: number): number {
  if (offset + 4 > buffer.byteLength) return 0;
  return new DataView(buffer).getUint32(offset, false);
}

function magicName(magic: number): string {
  const known: Record<number, string> = {
    [CSMAGIC_EMBEDDED_SIGNATURE]: "CSMAGIC_EMBEDDED_SIGNATURE",
    [CSMAGIC_EMBEDDED_SIGNATURE_DETACHED]: "CSMAGIC_EMBEDDED_SIGNATURE_DETACHED",
    [CSMAGIC_CODEDIRECTORY]: "CSMAGIC_CODEDIRECTORY",
    [CSMAGIC_EMBEDDED_ENTITLEMENTS]: "CSMAGIC_EMBEDDED_ENTITLEMENTS",
    [CSMAGIC_EMBEDDED_DER_ENTITLEMENTS]: "CSMAGIC_EMBEDDED_DER_ENTITLEMENTS",
    [CSMAGIC_REQUIREMENTS]: "CSMAGIC_REQUIREMENTS",
    [CSMAGIC_BLOBWRAPPER]: "CSMAGIC_BLOBWRAPPER",
  };
  return known[magic] ?? `0x${magic.toString(16).toUpperCase()}`;
}

/** Big-endian u32 read that respects the file bounds. */
function be32(buffer: ArrayBuffer, offset: number): number {
  if (offset < 0 || offset + 4 > buffer.byteLength) return 0;
  return new DataView(buffer).getUint32(offset, false);
}

function be8(buffer: ArrayBuffer, offset: number): number {
  if (offset < 0 || offset + 1 > buffer.byteLength) return 0;
  return new DataView(buffer).getUint8(offset);
}

/**
 * Extracts the XML plist carried inside an entitlements blob. The blob is a
 * length-prefixed wrapper; the payload is plain UTF-8 plist text and may be
 * NUL padded.
 */
function readPlistPayload(buffer: ArrayBuffer, start: number, length: number): string | null {
  if (length <= 8) return null;
  const body = new Uint8Array(buffer, start + 8, Math.min(length - 8, buffer.byteLength - start - 8));
  let text = new TextDecoder("utf-8", { fatal: false }).decode(body);
  const firstLt = text.indexOf("<");
  if (firstLt === -1) return null;
  text = text.slice(firstLt);
  const endTag = text.lastIndexOf("</plist>");
  if (endTag !== -1) text = text.slice(0, endTag + "</plist>".length);
  const nul = text.indexOf("\u0000");
  if (nul !== -1) text = text.slice(0, nul);
  return text.trim() || null;
}

function parseCodeDirectory(
  buffer: ArrayBuffer,
  start: number,
  length: number,
): CodeDirectoryInfo | null {
  if (length < 44) return null;
  const offset = start;
  const version = be32(buffer, offset + 8);
  const flags = be32(buffer, offset + 12);
  const identOffset = be32(buffer, offset + 20);
  const nSpecialSlots = be32(buffer, offset + 24);
  const nCodeSlots = be32(buffer, offset + 28);
  const codeLimit = be32(buffer, offset + 32);
  const hashSize = be8(buffer, offset + 36);
  const hashType = be8(buffer, offset + 37);
  const pageSizeByte = be8(buffer, offset + 39);

  let identifier = "";
  if (identOffset > 0 && offset + identOffset < buffer.byteLength) {
    const bytes = new Uint8Array(buffer, offset + identOffset, Math.min(512, buffer.byteLength - offset - identOffset));
    let end = 0;
    while (end < bytes.length && bytes[end] !== 0) end++;
    identifier = new TextDecoder().decode(bytes.subarray(0, end));
  }

  // teamID only exists from CodeDirectory version 0x20200 onwards and the
  // field sits after several optionals, so read it defensively.
  let teamId = "";
  if (version >= 0x20200) {
    const teamOffset = be32(buffer, offset + 48);
    if (teamOffset > 0 && offset + teamOffset < buffer.byteLength) {
      const bytes = new Uint8Array(buffer, offset + teamOffset, Math.min(256, buffer.byteLength - offset - teamOffset));
      let end = 0;
      while (end < bytes.length && bytes[end] !== 0) end++;
      teamId = new TextDecoder().decode(bytes.subarray(0, end));
    }
  }

  return {
    version,
    flags,
    identifier,
    teamId,
    hashType: HASH_TYPES[hashType] ?? `unknown (${hashType})`,
    hashSize,
    pageSize: pageSizeByte === 0 ? 0 : 1 << pageSizeByte,
    codeSlots: nCodeSlots,
    specialSlots: nSpecialSlots,
    codeLimit,
  };
}

/**
 * @param absOffset absolute file offset of the signature data
 * @param size      size from LC_CODE_SIGNATURE
 */
export function parseCodeSignature(
  buffer: ArrayBuffer,
  absOffset: number,
  size: number,
): CodeSignature | null {
  if (absOffset <= 0 || size <= 0 || absOffset + size > buffer.byteLength) return null;

  const magic = readBeMagic(buffer, absOffset);
  if (magic !== CSMAGIC_EMBEDDED_SIGNATURE && magic !== CSMAGIC_EMBEDDED_SIGNATURE_DETACHED) {
    return {
      fileOffset: absOffset,
      size,
      superBlobMagic: magicName(magic),
      blobs: [],
      codeDirectory: null,
      entitlementsXml: null,
      infoPlistXml: null,
      requirementsPresent: false,
    };
  }

  const count = be32(buffer, absOffset + 8);
  const blobs: SignatureBlob[] = [];
  let codeDirectory: CodeDirectoryInfo | null = null;
  let entitlementsXml: string | null = null;
  let infoPlistXml: string | null = null;
  let requirementsPresent = false;

  if (count > 64) return null;

  for (let i = 0; i < count; i++) {
    const indexAt = absOffset + 12 + i * 8;
    const type = be32(buffer, indexAt);
    const blobOffset = be32(buffer, indexAt + 4);
    const blobStart = absOffset + blobOffset;
    if (blobStart + 8 > buffer.byteLength) continue;

    const blobMagic = readBeMagic(buffer, blobStart);
    const blobLength = be32(buffer, blobStart + 4);

    blobs.push({
      type,
      typeName: BLOB_TYPES[type] ?? `type ${type}`,
      offset: blobStart - absOffset,
      length: blobLength,
      magic: magicName(blobMagic),
    });

    if (type === 0x00000) {
      codeDirectory = parseCodeDirectory(buffer, blobStart, blobLength);
    } else if (blobMagic === CSMAGIC_EMBEDDED_ENTITLEMENTS) {
      entitlementsXml = readPlistPayload(buffer, blobStart, blobLength);
    } else if (blobMagic === CSMAGIC_BLOBWRAPPER && type === 0x00001) {
      infoPlistXml = readPlistPayload(buffer, blobStart, blobLength);
    } else if (blobMagic === CSMAGIC_REQUIREMENTS) {
      requirementsPresent = true;
    }
  }

  return {
    fileOffset: absOffset,
    size,
    superBlobMagic: magicName(magic),
    blobs,
    codeDirectory,
    entitlementsXml,
    infoPlistXml,
    requirementsPresent,
  };
}
