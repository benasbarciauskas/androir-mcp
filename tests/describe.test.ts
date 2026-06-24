import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { parseUiXml } from "../dist/describe.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, "fixtures", "sample_window_dump.xml");
const fixture = readFileSync(fixturePath, "utf8");

describe("parseUiXml", () => {
  it("extracts labels and center coordinates from uiautomator XML", () => {
    const elements = parseUiXml(fixture);

    assert.ok(elements.length >= 5 && elements.length <= 8);

    const settings = elements.find((e) => e.label === "Settings");
    assert.ok(settings);
    assert.equal(settings.x, 180);
    assert.equal(settings.y, 84);

    const wifi = elements.find((e) => e.label === "Wi-Fi");
    assert.ok(wifi);
    assert.equal(wifi.x, 540);
    assert.equal(wifi.y, 260);

    const bluetooth = elements.find((e) => e.label === "Bluetooth settings");
    assert.ok(bluetooth);
    assert.equal(bluetooth.x, 540);
    assert.equal(bluetooth.y, 380);

    const display = elements.find((e) => e.label === "Display");
    assert.ok(display);
    assert.equal(display.x, 540);
    assert.equal(display.y, 500);

    const home = elements.find((e) => e.label === "Home");
    assert.ok(home);
    assert.equal(home.x, 540);
    assert.equal(home.y, 2300);

    const spacer = elements.find((e) => e.label === "View");
    assert.equal(spacer, undefined);
  });

  it("drops pure layout nodes without text, content-desc, or clickable", () => {
    const elements = parseUiXml(fixture);
    const frame = elements.find((e) => e.label === "FrameLayout");
    assert.equal(frame, undefined);
  });
});