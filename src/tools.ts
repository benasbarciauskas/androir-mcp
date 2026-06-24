import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  isValidSerial,
  resolveSerial,
  runAdb,
  runAdbShell,
} from "./adb.js";
import { formatElements, parseUiXml, type UiElement } from "./describe.js";

const KEY_MAP: Record<string, number> = {
  home: 3,
  back: 4,
  enter: 66,
  recents: 187,
};

function textResult(text: string, isError = false) {
  return {
    content: [{ type: "text" as const, text }],
    ...(isError ? { isError: true } : {}),
  };
}

function escapeInputText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'")
    .replace(/ /g, "%s")
    .replace(/&/g, "\\&")
    .replace(/</g, "\\<")
    .replace(/>/g, "\\>")
    .replace(/\|/g, "\\|")
    .replace(/;/g, "\\;")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/\$/g, "\\$")
    .replace(/`/g, "\\`")
    .replace(/!/g, "\\!")
    .replace(/\*/g, "\\*")
    .replace(/\?/g, "\\?");
}

function parseDevicesLong(output: string) {
  const lines = output.split("\n").slice(1);
  const targets: Array<{ serial: string; state: string; model?: string }> = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parts = trimmed.split(/\s+/);
    const serial = parts[0];
    const state = parts[1];

    if (!serial || !state || state === "no") continue;
    if (!isValidSerial(serial)) continue;

    let model: string | undefined;
    const modelMatch = trimmed.match(/model:(\S+)/);
    if (modelMatch) {
      model = modelMatch[1];
    }

    targets.push({ serial, state, model });
  }

  return targets;
}

async function dumpUiXml(serial: string): Promise<string> {
  try {
    const buf = await runAdb(serial, [
      "exec-out",
      "uiautomator",
      "dump",
      "/dev/tty",
    ]);
    const xml = buf.toString("utf8");
    const start = xml.indexOf("<?xml");
    if (start >= 0) return xml.slice(start);
    if (xml.includes("<hierarchy")) return xml;
  } catch {
    // fall through to sdcard fallback
  }

  await runAdbShell(serial, [
    "uiautomator",
    "dump",
    "/sdcard/uidump.xml",
  ]);

  const buf = await runAdb(serial, [
    "exec-out",
    "cat",
    "/sdcard/uidump.xml",
  ]);
  return buf.toString("utf8");
}

let packageCache: Map<string, string> | null = null;

async function loadPackages(serial: string): Promise<Map<string, string>> {
  if (packageCache) return packageCache;

  const buf = await runAdbShell(serial, ["pm", "list", "packages"]);
  const lines = buf.toString("utf8").split("\n");
  const map = new Map<string, string>();

  for (const line of lines) {
    const match = line.match(/^package:(.+)$/);
    if (match) {
      const pkg = match[1].trim();
      map.set(pkg.toLowerCase(), pkg);
    }
  }

  packageCache = map;
  return map;
}

async function resolvePackage(
  serial: string,
  nameOrPkg: string,
): Promise<string> {
  const trimmed = nameOrPkg.trim();
  if (!trimmed) throw new Error("App name or package required");

  const packages = await loadPackages(serial);

  if (packages.has(trimmed.toLowerCase())) {
    return packages.get(trimmed.toLowerCase())!;
  }

  if (trimmed.includes(".")) {
    for (const [, pkg] of packages) {
      if (pkg === trimmed) return pkg;
    }
  }

  const needle = trimmed.toLowerCase();
  const matches: string[] = [];

  for (const [, pkg] of packages) {
    const short = pkg.split(".").pop()?.toLowerCase() ?? "";
    if (
      pkg.toLowerCase().includes(needle) ||
      short === needle ||
      short.includes(needle)
    ) {
      matches.push(pkg);
    }
  }

  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    throw new Error(
      `Ambiguous app name "${trimmed}" (${matches.slice(0, 5).join(", ")}${matches.length > 5 ? ", …" : ""})`,
    );
  }

  throw new Error(`No package found for "${trimmed}"`);
}

export async function toolListTargets() {
  const buf = await runAdb(undefined, ["devices", "-l"]);
  const targets = parseDevicesLong(buf.toString("utf8"));
  return textResult(JSON.stringify(targets, null, 2));
}

export async function toolStatus(serial?: string) {
  const s = await resolveSerial(serial);

  const stateBuf = await runAdb(s, ["get-state"]);
  const state = stateBuf.toString("utf8").trim();

  const props: Record<string, string> = {};
  const propKeys = [
    "ro.product.model",
    "ro.product.manufacturer",
    "ro.build.version.release",
    "ro.build.version.sdk",
  ];

  for (const key of propKeys) {
    try {
      const val = await runAdbShell(s, ["getprop", key]);
      props[key] = val.toString("utf8").trim();
    } catch {
      props[key] = "";
    }
  }

  let battery: Record<string, string> = {};
  try {
    const batBuf = await runAdbShell(s, ["dumpsys", "battery"]);
    const batText = batBuf.toString("utf8");
    for (const line of batText.split("\n")) {
      const m = line.match(/^\s*(level|status|health|AC powered|USB powered):\s*(.+)$/i);
      if (m) battery[m[1].toLowerCase()] = m[2].trim();
    }
  } catch {
    battery = {};
  }

  return textResult(
    JSON.stringify({ serial: s, state, props, battery }, null, 2),
  );
}

export async function toolScreenshot(serial?: string) {
  const s = await resolveSerial(serial);
  const buf = await runAdb(s, ["exec-out", "screencap", "-p"], {
    timeoutMs: 60_000,
  });

  if (buf.length < 8) {
    return textResult("Screenshot empty", true);
  }

  return {
    content: [
      {
        type: "image" as const,
        data: buf.toString("base64"),
        mimeType: "image/png",
      },
    ],
  };
}

export async function toolDescribeScreen(serial?: string) {
  const s = await resolveSerial(serial);
  const xml = await dumpUiXml(s);
  const elements = parseUiXml(xml);

  if (elements.length === 0) {
    return textResult("No UI elements found", true);
  }

  return textResult(formatElements(elements));
}

export async function toolTap(serial: string | undefined, x: number, y: number) {
  const s = await resolveSerial(serial);
  await runAdbShell(s, ["input", "tap", String(x), String(y)]);
  return textResult(`Tapped (${x}, ${y})`);
}

export async function toolSwipe(
  serial: string | undefined,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  duration = 300,
) {
  const s = await resolveSerial(serial);
  await runAdbShell(s, [
    "input",
    "swipe",
    String(x1),
    String(y1),
    String(x2),
    String(y2),
    String(duration),
  ]);
  return textResult(`Swiped (${x1},${y1}) → (${x2},${y2}) in ${duration}ms`);
}

export async function toolLongPress(
  serial: string | undefined,
  x: number,
  y: number,
  duration = 1000,
) {
  const s = await resolveSerial(serial);
  await runAdbShell(s, [
    "input",
    "swipe",
    String(x),
    String(y),
    String(x),
    String(y),
    String(duration),
  ]);
  return textResult(`Long-pressed (${x}, ${y}) for ${duration}ms`);
}

export async function toolTypeText(serial: string | undefined, text: string) {
  const s = await resolveSerial(serial);
  const escaped = escapeInputText(text);
  await runAdbShell(s, ["input", "text", escaped]);
  return textResult(`Typed ${text.length} characters`);
}

export async function toolPressKey(serial: string | undefined, key: string) {
  const s = await resolveSerial(serial);
  const code = KEY_MAP[key.toLowerCase()];
  if (code === undefined) {
    return textResult(
      `Unknown key "${key}". Use: ${Object.keys(KEY_MAP).join(", ")}`,
      true,
    );
  }
  await runAdbShell(s, ["input", "keyevent", String(code)]);
  return textResult(`Pressed ${key} (keyevent ${code})`);
}

export async function toolPressHome(serial?: string) {
  const s = await resolveSerial(serial);
  await runAdbShell(s, ["input", "keyevent", "3"]);
  return textResult("Pressed home");
}

export async function toolPressBack(serial?: string) {
  const s = await resolveSerial(serial);
  await runAdbShell(s, ["input", "keyevent", "4"]);
  return textResult("Pressed back");
}

export async function toolLaunchApp(serial: string | undefined, nameOrPkg: string) {
  const s = await resolveSerial(serial);
  const pkg = await resolvePackage(s, nameOrPkg);

  await runAdbShell(s, [
    "monkey",
    "-p",
    pkg,
    "-c",
    "android.intent.category.LAUNCHER",
    "1",
  ]);

  return textResult(`Launched ${pkg}`);
}

export async function toolOpenUrl(serial: string | undefined, url: string) {
  const s = await resolveSerial(serial);
  if (!url || !/^https?:\/\//i.test(url)) {
    return textResult("URL must start with http:// or https://", true);
  }

  await runAdbShell(s, [
    "am",
    "start",
    "-a",
    "android.intent.action.VIEW",
    "-d",
    url,
  ]);

  return textResult(`Opened ${url}`);
}

const optionalSerial = z
  .string()
  .optional()
  .describe("Device serial (optional; required when multiple devices connected)");

export function registerTools(server: McpServer): void {
  server.tool(
    "list_targets",
    "List connected Android devices (serial, state, model)",
    async () => toolListTargets(),
  );

  server.tool(
    "status",
    "Device info: state, properties, battery",
    { serial: optionalSerial },
    async ({ serial }) => toolStatus(serial),
  );

  server.tool(
    "screenshot",
    "Capture device screen as PNG",
    { serial: optionalSerial },
    async ({ serial }) => toolScreenshot(serial),
  );

  server.tool(
    "describe_screen",
    "Parse uiautomator UI tree; returns element labels and tap coordinates",
    { serial: optionalSerial },
    async ({ serial }) => toolDescribeScreen(serial),
  );

  server.tool(
    "tap",
    "Tap at screen coordinates (device pixels)",
    {
      serial: optionalSerial,
      x: z.number().describe("X coordinate"),
      y: z.number().describe("Y coordinate"),
    },
    async ({ serial, x, y }) => toolTap(serial, x, y),
  );

  server.tool(
    "swipe",
    "Swipe from (x1,y1) to (x2,y2)",
    {
      serial: optionalSerial,
      x1: z.number().describe("Start X"),
      y1: z.number().describe("Start Y"),
      x2: z.number().describe("End X"),
      y2: z.number().describe("End Y"),
      duration: z.number().optional().describe("Duration in ms (default 300)"),
    },
    async ({ serial, x1, y1, x2, y2, duration }) =>
      toolSwipe(serial, x1, y1, x2, y2, duration ?? 300),
  );

  server.tool(
    "long_press",
    "Long press at (x,y)",
    {
      serial: optionalSerial,
      x: z.number().describe("X coordinate"),
      y: z.number().describe("Y coordinate"),
      duration: z.number().optional().describe("Duration in ms (default 1000)"),
    },
    async ({ serial, x, y, duration }) =>
      toolLongPress(serial, x, y, duration ?? 1000),
  );

  server.tool(
    "type_text",
    "Type text via adb input (spaces become %s)",
    {
      serial: optionalSerial,
      text: z.string().describe("Text to type"),
    },
    async ({ serial, text }) => toolTypeText(serial, text),
  );

  server.tool(
    "press_key",
    "Press a named key (home, back, enter, recents)",
    {
      serial: optionalSerial,
      key: z.string().describe("Key name"),
    },
    async ({ serial, key }) => toolPressKey(serial, key),
  );

  server.tool(
    "press_home",
    "Press the home button",
    { serial: optionalSerial },
    async ({ serial }) => toolPressHome(serial),
  );

  server.tool(
    "press_back",
    "Press the back button",
    { serial: optionalSerial },
    async ({ serial }) => toolPressBack(serial),
  );

  server.tool(
    "launch_app",
    "Launch app by package name or friendly name",
    {
      serial: optionalSerial,
      name: z.string().describe("App name or package (e.g. com.android.chrome)"),
    },
    async ({ serial, name }) => toolLaunchApp(serial, name),
  );

  server.tool(
    "open_url",
    "Open URL in default browser",
    {
      serial: optionalSerial,
      url: z.string().describe("HTTP(S) URL"),
    },
    async ({ serial, url }) => toolOpenUrl(serial, url),
  );
}

export type { UiElement };