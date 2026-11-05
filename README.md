# binlens

A Mach-O inspector that runs entirely in your browser. Drop in a macOS or iOS
binary and see its load commands, segments, linked libraries, code signature,
entitlements, strings and raw bytes.

**Live:** https://binlens.netlify.app

No uploads, no accounts, no parsing libraries.

---

## Why this exists

Most frontend portfolios are forms over a REST API. The work I actually enjoy is
taking a data format nobody has modelled for the web yet and building an
interface that makes it legible — virtualising 20,000 rows without dropping
frames, decoding a 40-year-old binary header, keeping a 82 MB file off the main
thread.

Mach-O is a good subject because it is unforgiving. Every field is byte-aligned,
endianness matters, and a parser that guesses produces confident nonsense. There
is also a ground truth to check against: Apple ships `lipo`, `otool` and
`codesign` on every Mac, so every claim this tool makes can be verified against
the vendor's own implementation.

## What it reads

| View | Contents |
| --- | --- |
| Overview | Header, UUID, flags, build version, entry point, code directory, rpaths |
| Segments | Every `LC_SEGMENT(_64)` with its sections, addresses, protections, sizes |
| Commands | All load commands with a one-line summary of what each carries |
| Libraries | Linked dylibs with current and compatibility versions |
| Signature | Superblob layout, CodeDirectory, entitlements as an XML plist tree or raw text |
| Strings | ASCII and UTF-16 extraction, filterable, virtualised |
| Hex | Paged raw bytes with section jumps and range highlighting |

Universal binaries are split by architecture in the sidebar; every view follows
the selected slice.

## Decisions

**No parsing dependencies.** The whole parser is `DataView` calls over an
`ArrayBuffer`. That is roughly 1,250 lines of reader code and zero runtime
dependencies beyond React. It keeps the install at 96 MB instead of the 376 MB
a Next.js toolchain takes on the same machine, and it means every offset can be
traced to a field in `mach-o/loader.h`. Pulling in a library would have hidden
the only interesting part of the project.

**Parse off the main thread.** Files are structured-cloned into a worker and
parsed there. The main thread only receives plain objects. If a browser refuses
to start the worker, `parseFile` falls back to inline parsing — slower, but the
app still works. A 120 MB binary parses in about 800 ms, most of it string
extraction, which stops at its cap.

**Virtualise the list, not the data.** A large binary can yield tens of
thousands of strings. Extraction stops at 20,000 and the UI renders roughly 25
rows at a time, so the DOM stays small regardless of file size. Filtering runs
against the array; only the visible window is mounted.

**Generate fixtures instead of committing binaries.** `tests/helpers/build.ts`
writes Mach-O files byte by byte — header, load commands, segments, code
signature superblob. Every assertion sits next to the bytes it describes, the
repository stays text-only, and a change to the layout breaks the tests
immediately.

**Read the signature, do not verify it.** binlens shows what a signature
*contains* — hashes, identity, team ID, entitlements, blob layout. It does not
validate the CMS signature against Apple's certificate chain. Showing the
structure without claiming to establish trust is the honest position, and it is
what `codesign -d` does too.

## Verification

The parser is checked against Apple's own tools, not against my reading of the
spec:

```console
$ node scripts/verify.ts /bin/cat
container=fat slices=2  cpu=x86_64,arm64e
$ lipo -archs /bin/cat
x86_64 arm64e

$ codesign -d --entitlements - /bin/ps    # byte-identical to the plist tree shown in the Signature view
$ otool -L /bin/cat                        # same install names and versions as the Libraries view
```

## Tests

```console
npm test              # 55 tests, ~430 ms
npm run test:coverage # 99.20% statements · 96.11% branches · 94.37% functions
```

- `tests/parse.test.ts` — headers, segments, dylibs, rpaths, UUID, build
  version, entry point, symbol table, strings, 32-bit, big-endian, fat.
- `tests/robustness.test.ts` — non-Mach-O input, truncated files, implausible
  headers, plus 800 fuzz iterations with two properties: nothing throws, and
  anything that does parse stays structurally sane.
- `tests/reader.test.ts` — bounds-checked primitives and version formatting.
- `tests/real-binaries.test.ts` — integration tests against `/bin/cat` and
  `/bin/ps`, skipped automatically on non-macOS CI.

### Three bugs the tests found

1. **Warnings were swallowed when a slice failed.** `parseBinary` returned a
   generic "could not be read" and discarded the reason. A truncated universal
   binary now names the architecture that points outside the file.

2. **A UTF-16 run ending at the buffer edge was dropped.** `__ustring` is where
   Swift and Objective-C keep wide literals; the flush only ran on a terminator,
   so a string ending at the section boundary disappeared. Coverage said
   `strings.ts` was 78% covered, I went to close the branch, and the uncovered
   path was hiding a correctness bug.

3. **`LC_SOURCE_VERSION` was decoded with the wrong field widths.** It is
   `A.B.C.D.E` packed as `a24.b10.c10.d10.e10`, not four 16-bit fields. binlens
   reported `/bin/cat` as `0.39424.0.0`; `otool` says `154.0`. The fix is four
   shifts, and the test that locks it in compares against the raw values of
   `/bin/cat` and `/bin/ps`.

The third found me: I was checking the interface against a real binary and the
number looked wrong. That is the workflow the test suite is for.

## Limits

- **No disassembly.** This reads structure, not instructions.
- **No signature trust.** See above.
- **Strings are capped** at 20,000 per slice to keep extraction bounded.
- **Mach-O only.** ELF and PE files are rejected with the first four bytes
  shown, which is the useful thing to know about them.
- **No dyld shared cache or IPA extraction.** You feed it a file, not an archive.

## Running it

```console
npm install
npm run dev      # http://localhost:5173
npm test
npm run build    # static output in dist/
npm run preview
```

Node 22 or newer. No environment variables, no backend.

## Layout

```
src/lib/macho/     parser: constants, reader, parse, signature, strings, build
src/lib/           worker client, feature-flagged fallback, sample generator, plist reader
src/components/    one component per view, plus the virtual list and shared primitives
tests/             fixtures, parser tests, fuzz tests, real-binary tests
scripts/verify.ts  command-line dump of any binary, for comparing against Apple's tools
```

## Sample

`src/lib/sample.ts` builds a universal binary at runtime with two slices, four
dylibs, a build version, an rpath, a symbol table and a signed entitlements
plist. Opening the sample exercises every view without a file on disk.
