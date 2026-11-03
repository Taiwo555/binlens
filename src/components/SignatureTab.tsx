import { useMemo, useState } from "react";
import type { Slice } from "../lib/macho/types.ts";
import { isDictionary, parsePlist, type PlistValue } from "../lib/plist.ts";
import { formatBytes } from "../lib/macho/reader.ts";
import { Badge, Card, CopyButton, Empty } from "./ui.tsx";

function primitive(value: PlistValue) {
  if (typeof value === "boolean") {
    return <Badge tone={value ? "accent" : "muted"}>{String(value)}</Badge>;
  }
  if (typeof value === "number") {
    return <span className="plist-value mono">{String(value)}</span>;
  }
  return <span className="plist-value mono">{String(value)}</span>;
}

function PlistNode({ name, value, depth }: { name?: string; value: PlistValue; depth: number }) {
  const indent = { paddingLeft: depth * 18 };

  if (Array.isArray(value)) {
    return (
      <div className="plist-group">
        {name && (
          <div className="plist-row" style={indent}>
            <span className="plist-key">{name}</span>
            <span className="plist-count">{value.length} items</span>
          </div>
        )}
        {value.map((item, index) => (
          <PlistNode key={index} name={`[${index}]`} value={item} depth={depth + (name ? 1 : 0)} />
        ))}
      </div>
    );
  }

  if (isDictionary(value)) {
    const entries = Object.entries(value);
    return (
      <div className="plist-group">
        {name && (
          <div className="plist-row" style={indent}>
            <span className="plist-key">{name}</span>
            <span className="plist-count">{entries.length} keys</span>
          </div>
        )}
        {entries.map(([key, item]) => (
          <PlistNode key={key} name={key} value={item} depth={depth + (name ? 1 : 0)} />
        ))}
      </div>
    );
  }

  return (
    <div className="plist-row" style={indent}>
      <span className="plist-key">{name ?? ""}</span>
      {primitive(value)}
    </div>
  );
}

export function SignatureTab({ slice }: { slice: Slice }) {
  const signature = slice.codeSignature;
  const [showRaw, setShowRaw] = useState(false);

  const entitlements = useMemo(() => {
    if (!signature?.entitlementsXml) return null;
    return parsePlist(signature.entitlementsXml);
  }, [signature]);

  if (!signature) {
    return (
      <Empty title="Not signed">
        This binary carries no LC_CODE_SIGNATURE command. Unsigned executables are rejected by macOS
        unless they are built locally.
      </Empty>
    );
  }

  const directory = signature.codeDirectory;

  return (
    <div className="stack">
      <Card
        title="Signature blobs"
        subtitle={`${signature.superBlobMagic} · ${formatBytes(signature.size)} at 0x${signature.fileOffset.toString(16)}`}
      >
        <table className="table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Magic</th>
              <th className="num">Length</th>
              <th className="num">Offset</th>
            </tr>
          </thead>
          <tbody>
            {signature.blobs.map((blob) => (
              <tr key={`${blob.type}-${blob.offset}`}>
                <td className="strong">{blob.typeName}</td>
                <td className="mono muted-cell">{blob.magic}</td>
                <td className="num mono">{blob.length}</td>
                <td className="num mono muted-cell">0x{blob.offset.toString(16)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {directory && (
        <Card title="Code directory" subtitle="Hashes and identity used by the kernel to validate pages.">
          <div className="kv">
            <div>
              <dt>Identifier</dt>
              <dd className="mono">
                {directory.identifier || "—"}
                <CopyButton value={directory.identifier} />
              </dd>
            </div>
            <div>
              <dt>Team ID</dt>
              <dd className="mono">
                {directory.teamId || "—"}
                {directory.teamId && <CopyButton value={directory.teamId} />}
              </dd>
            </div>
            <div>
              <dt>Hash type</dt>
              <dd className="mono">
                {directory.hashType} · {directory.hashSize} bytes
              </dd>
            </div>
            <div>
              <dt>Page size</dt>
              <dd className="mono">{formatBytes(directory.pageSize)}</dd>
            </div>
            <div>
              <dt>Slots</dt>
              <dd className="mono">
                {directory.codeSlots} code · {directory.specialSlots} special
              </dd>
            </div>
            <div>
              <dt>Code limit</dt>
              <dd className="mono">{formatBytes(directory.codeLimit)}</dd>
            </div>
          </div>
        </Card>
      )}

      <Card
        title="Entitlements"
        subtitle="Privileges granted to this binary by the operating system."
        action={
          signature.entitlementsXml ? (
            <div className="actions">
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => setShowRaw((value) => !value)}>
                {showRaw ? "Parsed" : "Raw XML"}
              </button>
              <CopyButton value={signature.entitlementsXml} label="Copy" />
            </div>
          ) : undefined
        }
      >
        {!signature.entitlementsXml && <Empty title="No entitlements">This binary is signed without any entitlements.</Empty>}

        {signature.entitlementsXml && showRaw && (
          <pre className="code-block">{signature.entitlementsXml}</pre>
        )}

        {signature.entitlementsXml && !showRaw && (
          <div className="plist">
            {entitlements ? <PlistNode value={entitlements} depth={0} /> : <p className="muted">Could not parse the entitlement plist.</p>}
          </div>
        )}
      </Card>
    </div>
  );
}
