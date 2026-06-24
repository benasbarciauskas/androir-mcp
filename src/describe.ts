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

function parseBounds(bounds: string): Bounds | null {
  const match = bounds.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
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

function getAttr(tag: string, name: string): string {
  const re = new RegExp(`${name}="([^"]*)"`, "i");
  const match = tag.match(re);
  return match ? match[1] : "";
}

function extractNodeTags(xml: string): string[] {
  const tags: string[] = [];
  const re = /<node\b[^>]*\/?>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    tags.push(match[0]);
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
  const tags = extractNodeTags(xmlString);

  for (const tag of tags) {
    const text = getAttr(tag, "text");
    const contentDesc = getAttr(tag, "content-desc");
    const className = getAttr(tag, "class");
    const clickable = getAttr(tag, "clickable");
    const boundsStr = getAttr(tag, "bounds");

    const hasLabel = text.length > 0 || contentDesc.length > 0;
    const isClickable = clickable === "true";

    if (!hasLabel && !isClickable) continue;

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
  }

  return elements;
}

export function formatElements(elements: UiElement[]): string {
  return elements
    .map((el) => `"${el.label}" at (${el.x},${el.y})`)
    .join("\n");
}