import { spawn } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { join } from "node:path";

const SERIAL_RE = /^[A-Za-z0-9.:_-]{1,128}$/;
const DEFAULT_TIMEOUT_MS = 30_000;

const ADB_SEARCH_PATHS = [
  "",
  "/opt/homebrew/bin",
  "/usr/local/bin",
  "/usr/bin",
];

let cachedAdbPath: string | null = null;

/**
 * A failure from adb whose message is already concise and safe to surface to
 * the MCP client. Raw adb stderr (which can leak serials, device file paths,
 * etc.) is mapped to one of these before it ever reaches the caller.
 */
export class AdbError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdbError";
  }
}

/**
 * Reduce raw adb stderr to a short, scrubbed message. adb error text can
 * include the device serial, on-device file paths, and other internals; none
 * of that should reach the model. We classify the common cases and otherwise
 * return a generic, length-capped summary with no host/device detail.
 */
function scrubAdbError(stderr: string, code: number | null): string {
  const lower = stderr.toLowerCase();
  if (lower.includes("device offline")) return "device offline";
  if (lower.includes("device unauthorized") || lower.includes("unauthorized")) {
    return "device unauthorized (accept the USB debugging prompt)";
  }
  if (lower.includes("no devices") || lower.includes("device not found")) {
    return "device not found";
  }
  if (lower.includes("more than one device")) {
    return "multiple devices connected; specify a serial";
  }
  if (lower.includes("permission denied")) return "adb command failed: permission denied";
  // Generic fallback: first line only, capped, no paths/serials beyond that.
  const firstLine = stderr.split("\n")[0]?.trim() ?? "";
  const summary = firstLine ? firstLine.slice(0, 80) : `exit ${code ?? "?"}`;
  return `adb command failed: ${summary}`;
}

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function isValidSerial(serial: string): boolean {
  return SERIAL_RE.test(serial);
}

export function resolveAdb(): string {
  if (cachedAdbPath) {
    return cachedAdbPath;
  }

  const pathEnv = process.env.PATH ?? "";
  const pathDirs = pathEnv.split(":").filter(Boolean);

  for (const dir of [...pathDirs, ...ADB_SEARCH_PATHS.filter((p) => p)]) {
    const candidate = dir ? join(dir, "adb") : "adb";
    if (isExecutable(candidate)) {
      cachedAdbPath = candidate;
      return candidate;
    }
  }

  throw new AdbError(
    "adb not found. Install Android platform-tools and ensure adb is on PATH.",
  );
}

export interface RunAdbOptions {
  timeoutMs?: number;
}

export async function runAdb(
  serial: string | undefined,
  args: string[],
  options: RunAdbOptions = {},
): Promise<Buffer> {
  const adb = resolveAdb();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const fullArgs: string[] = [];
  if (serial !== undefined) {
    if (!isValidSerial(serial)) {
      throw new AdbError("Invalid device serial");
    }
    fullArgs.push("-s", serial);
  }
  fullArgs.push(...args);

  return new Promise((resolve, reject) => {
    const child = spawn(adb, fullArgs, {
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });

    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];

    // Single-settle guard: whichever of close/error/timeout fires first wins;
    // the others become no-ops. Without this, a timeout could reject AFTER a
    // close already resolved (or vice versa) -- an unhandled double-settle.
    let settled = false;

    const killGroup = () => {
      try {
        if (child.pid !== undefined) {
          process.kill(-child.pid, "SIGKILL");
        } else {
          child.kill("SIGKILL");
        }
      } catch {
        try {
          child.kill("SIGKILL");
        } catch {
          // process already gone
        }
      }
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      killGroup();
      reject(new AdbError(`adb timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => errChunks.push(chunk));

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Reap the detached process group too, so a partially-spawned child
      // can't be orphaned holding the timeout open.
      killGroup();
      reject(
        err instanceof Error && err.message.includes("ENOENT")
          ? new AdbError("adb not found on PATH")
          : new AdbError("adb command failed to start"),
      );
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        const stderr = Buffer.concat(errChunks).toString("utf8").trim();
        reject(new AdbError(scrubAdbError(stderr, code)));
        return;
      }
      resolve(Buffer.concat(chunks));
    });
  });
}

export async function runAdbShell(
  serial: string,
  shellArgs: string[],
  options: RunAdbOptions = {},
): Promise<Buffer> {
  return runAdb(serial, ["shell", ...shellArgs], options);
}

interface DeviceEntry {
  serial: string;
  state: string;
}

function parseDevicesOutput(output: string): DeviceEntry[] {
  const lines = output.split("\n").slice(1);
  const devices: DeviceEntry[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parts = trimmed.split(/\s+/);
    const serial = parts[0];
    const state = parts[1];

    if (!serial || !state || state === "no") continue;
    if (!isValidSerial(serial)) continue;

    devices.push({ serial, state });
  }

  return devices;
}

export async function listDeviceSerials(): Promise<DeviceEntry[]> {
  const output = await runAdb(undefined, ["devices"]);
  return parseDevicesOutput(output.toString("utf8"));
}

export async function resolveSerial(provided?: string): Promise<string> {
  if (provided !== undefined && provided !== "") {
    if (!isValidSerial(provided)) {
      throw new AdbError("Invalid device serial");
    }
    return provided;
  }

  const devices = await listDeviceSerials();
  const ready = devices.filter((d) => d.state === "device");

  if (ready.length === 0) {
    throw new AdbError("No Android device connected");
  }
  if (ready.length > 1) {
    throw new AdbError(
      `Multiple devices connected (${ready.map((d) => d.serial).join(", ")}). Specify serial.`,
    );
  }

  return ready[0].serial;
}
