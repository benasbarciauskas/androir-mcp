#!/usr/bin/env node

import {
  toolDescribeScreen,
  toolListTargets,
  toolScreenshot,
} from "./tools.js";

async function main(): Promise<void> {
  const failures: string[] = [];

  try {
    const targetsResult = await toolListTargets();
    const text = targetsResult.content[0];
    if (text.type !== "text") {
      failures.push("list_targets: unexpected response type");
    } else {
      const targets = JSON.parse(text.text) as unknown[];
      if (!Array.isArray(targets) || targets.length < 1) {
        failures.push("list_targets: expected >= 1 device");
      }
    }
  } catch (err) {
    failures.push(
      `list_targets: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  try {
    const shot = await toolScreenshot();
    const image = shot.content.find((c) => c.type === "image");
    if (!image || image.type !== "image" || !image.data) {
      failures.push("screenshot: no image content");
    } else {
      const buf = Buffer.from(image.data, "base64");
      const pngSig = [0x89, 0x50, 0x4e, 0x47];
      const valid =
        buf.length > 8 &&
        pngSig.every((b, i) => buf[i] === b);
      if (!valid) {
        failures.push("screenshot: not a valid PNG");
      }
    }
  } catch (err) {
    failures.push(
      `screenshot: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  try {
    const desc = await toolDescribeScreen();
    const text = desc.content[0];
    if (text.type !== "text") {
      failures.push("describe_screen: unexpected response type");
    } else if (text.text.startsWith("No UI")) {
      failures.push("describe_screen: no elements");
    } else {
      const lines = text.text.split("\n").filter(Boolean);
      if (lines.length < 1) {
        failures.push("describe_screen: expected >= 1 element");
      }
    }
  } catch (err) {
    failures.push(
      `describe_screen: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (failures.length > 0) {
    console.error("FAIL");
    for (const f of failures) {
      console.error(`  - ${f}`);
    }
    process.exit(1);
  }

  console.log("PASS");
}

main().catch((err) => {
  console.error("FAIL");
  console.error(`  - ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});