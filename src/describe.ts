export interface UiElement {
  label: string;
  x: number;
  y: number;
}

interface Bounds {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Decode the five named XML entities plus numeric (decimal and hex) character
 * references. uiautomator emits attribute text entity-encoded, e.g.
 * `text="Save &amp; Exit"`, which must be decoded before it is shown as a
 * label. `&amp;` is decoded LAST so a literal `&amp;` in the source round-trips
 * correctly.
 */
export function decodeXmlEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex: string) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) ? safeFromCodePoint(code) : _m;
    })
    .replace(/&#(\d+);/g, (_m, dec: string) => {
      const code = parseInt(dec, 10);
      return Number.isFinite(code) ? safeFromCodePoint(code) : _m;
    })
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function safeFromCodePoint(code: number): string {
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

function parseBounds(bounds: string): Bounds | null {
  const match = bounds.match(/\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/);
  if (!match) return null;

  const x1 = parseInt(match[1], 10);
  const y1 = parseInt(match[2], 10);
  const x2 = parseInt(match[3], 10);
  const y2 = parseInt(match[4], 10);

  if (Number.isNaN(x1) || Number.isNaN(y1) || Number.isNaN(x2) || Number.isNaN(y2)) {
    return null;
  }

  return { x1, y1, x2, y2 };
}

/**
 * Extract a single attribute value from a node tag. Attributes are matched
 * individually (never by slicing the whole tag at the next `>`), so a literal
 * `>` inside an attribute value -- e.g. `text="a > b"` -- does not corrupt
 * extraction. The returned value is XML-entity-decoded.
 */
function getAttr(tag: string, name: string): string {
  // Attribute names in uiautomator XML are simple (letters, digits, hyphen).
  const re = new RegExp(`(?:^|\\s)${name}="([^"]*)"`, "i");
  const match = tag.match(re);
  return match ? decodeXmlEntities(match[1]) : "";
}

/**
 * Find each `<node ...>` opening tag tolerantly. We anchor on `<node` and a
 * following whitespace/`>`/`/` boundary, then walk forward to the tag's
 * closing `>` while skipping any `>` that sits inside a double-quoted
 * attribute value. This never throws and returns whatever well-formed node
 * tags were found, even from truncated or partially malformed XML.
 */
function extractNodeTags(xml: string): string[] {
  const tags: string[] = [];
  const open = /<node(?=[\s/>])/gi;
  let m: RegExpExecArray | null;

  while ((m = open.exec(xml)) !== null) {
    const start = m.index;
    let i = start + m[0].length;
    let inQuote = false;
    let closed = false;

    for (; i < xml.length; i++) {
      const ch = xml[i];
      if (ch === '"') {
        inQuote = !inQuote;
      } else if (ch === ">" && !inQuote) {
        closed = true;
        break;
      }
    }

    // Truncated tag (no closing `>`): skip it cleanly, keep prior nodes.
    if (!closed) break;

    tags.push(xml.slice(start, i + 1));
    open.lastIndex = i + 1;
  }

  return tags;
}

function buildLabel(text: string, contentDesc: string, className: string): string {
  if (text) return text;
  if (contentDesc) return contentDesc;
  if (className) {
    const short = className.split(".").pop() ?? className;
    return short;
  }
  return "";
}

export function parseUiXml(xmlString: string): UiElement[] {
  const elements: UiElement[] = [];

  let tags: string[];
  try {
    tags = extractNodeTags(xmlString);
  } catch {
    // Parsing must never throw -- return whatever (nothing) was salvaged.
    return elements;
  }

  for (const tag of tags) {
    try {
      const text = getAttr(tag, "text");
      const contentDesc = getAttr(tag, "content-desc");
      const className = getAttr(tag, "class");
      const clickable = getAttr(tag, "clickable");
      const boundsStr = getAttr(tag, "bounds");

      const hasLabel = text.length > 0 || contentDesc.length > 0;
      const isClickable = clickable === "true";

      if (!hasLabel && !isClickable) continue;

      // Every emitted node MUST have parseable bounds; skip cleanly otherwise.
      const bounds = parseBounds(boundsStr);
      if (!bounds) continue;

      const label = buildLabel(text, contentDesc, className);
      if (!label && !isClickable) continue;

      const x = Math.round((bounds.x1 + bounds.x2) / 2);
      const y = Math.round((bounds.y1 + bounds.y2) / 2);

      elements.push({
        label: label || className.split(".").pop() || "element",
        x,
        y,
      });
    } catch {
      // A single malformed node never aborts the whole parse.
      continue;
    }
  }

  return elements;
}

export function formatElements(elements: UiElement[]): string {
  return elements
    .map((el) => `"${el.label}" at (${el.x},${el.y})`)
    .join("\n");
}
