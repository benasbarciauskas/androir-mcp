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

  throw new Error(
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
      throw new Error("Invalid device serial");
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

    const timer = setTimeout(() => {
      try {
        if (child.pid !== undefined) {
          process.kill(-child.pid, "SIGKILL");
        }
      } catch {
        child.kill("SIGKILL");
      }
      reject(new Error(`adb timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => errChunks.push(chunk));

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const stderr = Buffer.concat(errChunks).toString("utf8").trim();
        reject(new Error(stderr || `adb exited with code ${code}`));
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
      throw new Error("Invalid device serial");
    }
    return provided;
  }

  const devices = await listDeviceSerials();
  const ready = devices.filter((d) => d.state === "device");

  if (ready.length === 0) {
    throw new Error("No Android device connected");
  }
  if (ready.length > 1) {
    throw new Error(
      `Multiple devices connected (${ready.map((d) => d.serial).join(", ")}). Specify serial.`,
    );
  }

  return ready[0].serial;
}