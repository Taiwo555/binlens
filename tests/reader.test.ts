import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Reader, formatBytes, formatVersion, hex } from "../src/lib/macho/reader.ts";
import { packVersion, toArrayBuffer } from "./helpers/build.ts";

describe("reader primitives", () => {
  test("reads inside the buffer", () => {
    const bytes = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);
    const reader = new Reader(toArrayBuffer(bytes), true);
    assert.equal(reader.byteLength, 8);
    assert.equal(reader.u8(0), 0x01);
    assert.equal(reader.u32(0), 0x04030201);
  });

  test("reads a 64-bit field", () => {
    const bytes = new Uint8Array([42, 0, 0, 0, 0, 0, 0, 0]);
    const reader = new Reader(toArrayBuffer(bytes), true);
    assert.equal(reader.u64(0), 42);
  });

  test("respects big-endian order", () => {
    const bytes = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
    const reader = new Reader(toArrayBuffer(bytes), false);
    assert.equal(reader.u32(0), 0x01020304);
  });

  test("reports whether a range fits", () => {
    const reader = new Reader(new ArrayBuffer(8), true);
    assert.equal(reader.fits(0, 8), true);
    assert.equal(reader.fits(4, 4), true);
    assert.equal(reader.fits(4, 8), false);
    assert.equal(reader.fits(-1, 2), false);
  });

  test("stops fixed-width names at the first NUL", () => {
    const bytes = new Uint8Array(16);
    bytes.set(new TextEncoder().encode("__TEXT"), 0);
    const reader = new Reader(toArrayBuffer(bytes), true);
    assert.equal(reader.fixedString(0, 16), "__TEXT");
  });

  test("caps runaway C strings instead of overrunning", () => {
    const bytes = new Uint8Array(64).fill(0x41);
    const reader = new Reader(toArrayBuffer(bytes), true);
    assert.equal(reader.cstring(0, 10).length, 10);
    assert.equal(reader.cstring(60, 10).length, 4);
  });

  test("returns empty strings for out-of-range reads", () => {
    const reader = new Reader(new ArrayBuffer(4), true);
    assert.equal(reader.cstring(99), "");
    assert.equal(reader.decode(0, 99), "");
    assert.equal(reader.decode(0, 0), "");
  });
});

describe("formatting helpers", () => {
  test("unpacks Mach-O version fields", () => {
    assert.equal(formatVersion(packVersion(13, 1)), "13.1.0");
    assert.equal(formatVersion(packVersion(1319)), "1319.0.0");
    assert.equal(formatVersion(packVersion(228, 0, 4)), "228.0.4");
  });

  test("formats hexadecimal with padding", () => {
    assert.equal(hex(0x3514), "3514");
    assert.equal(hex(255, 4), "00FF");
  });

  test("formats byte counts", () => {
    assert.equal(formatBytes(512), "512 B");
    assert.equal(formatBytes(2048), "2.0 KB");
    assert.equal(formatBytes(5 * 1024 * 1024), "5.00 MB");
  });
});
