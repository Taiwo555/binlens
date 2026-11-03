export type PlistValue =
  | string
  | number
  | boolean
  | PlistValue[]
  | { [key: string]: PlistValue };

function childElements(node: Element): Element[] {
  return Array.from(node.children);
}

function textOf(node: Element): string {
  return node.textContent ?? "";
}

/**
 * Parses an XML property list into plain values. Entitlements are always XML
 * plists, so the DOM parser the browser already has is enough — no library.
 */
export function parsePlist(xml: string): PlistValue | null {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) return null;

  const root = doc.documentElement;
  if (!root) return null;

  const plist = root.tagName === "plist" ? root : root;
  const value = childElements(plist).find((child) => child.tagName !== "xml");
  if (!value) return null;

  return parseNode(value);
}

function parseNode(node: Element): PlistValue {
  switch (node.tagName) {
    case "dict": {
      const result: { [key: string]: PlistValue } = {};
      const children = childElements(node);
      for (let i = 0; i < children.length; i++) {
        const keyNode = children[i];
        if (keyNode.tagName !== "key") continue;
        const valueNode = children[i + 1];
        const key = textOf(keyNode);
        if (valueNode) {
          result[key] = parseNode(valueNode);
          i++;
        }
      }
      return result;
    }
    case "array":
      return childElements(node).map(parseNode);
    case "true":
      return true;
    case "false":
      return false;
    case "integer":
      return Number.parseInt(textOf(node), 10);
    case "real":
      return Number.parseFloat(textOf(node));
    case "string":
      return textOf(node);
    case "date":
      return textOf(node);
    case "data":
      return textOf(node).replace(/\s+/g, "");
    default:
      return textOf(node);
  }
}

export function isDictionary(value: PlistValue): value is { [key: string]: PlistValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
