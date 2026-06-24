import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { decodeXmlEntities, parseUiXml } from "../dist/describe.js";

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

describe("decodeXmlEntities", () => {
  it("decodes the five named entities", () => {
    assert.equal(
      decodeXmlEntities("Save &amp; Exit &lt;tag&gt; &quot;q&quot; &apos;a&apos;"),
      `Save & Exit <tag> "q" 'a'`,
    );
  });

  it("decodes decimal and hex numeric references", () => {
    assert.equal(decodeXmlEntities("&#65;&#x42;&#67;"), "ABC");
  });

  it("decodes &amp; last so a literal &amp; round-trips", () => {
    // Source `&amp;lt;` is a literal `&lt;`, NOT the `<` entity.
    assert.equal(decodeXmlEntities("&amp;lt;"), "&lt;");
  });
});

describe("parseUiXml entity decoding", () => {
  it("decodes entity-encoded text in emitted labels", () => {
    const xml =
      '<hierarchy rotation="0">' +
      '<node text="A &amp; B &lt;tag&gt; &#65;" class="android.widget.TextView" ' +
      'clickable="true" bounds="[0,0][100,100]"/>' +
      "</hierarchy>";
    const elements = parseUiXml(xml);
    const el = elements.find((e) => e.label === "A & B <tag> A");
    assert.ok(el, "expected decoded label 'A & B <tag> A'");
    assert.equal(el.x, 50);
    assert.equal(el.y, 50);
  });
});

describe("parseUiXml robustness", () => {
  it("returns empty for an empty hierarchy", () => {
    assert.deepEqual(parseUiXml('<hierarchy rotation="0"></hierarchy>'), []);
  });

  it("never throws and returns valid nodes from truncated XML", () => {
    // Second node is cut off mid-tag (no closing `>`); first must still parse.
    const xml =
      '<hierarchy><node text="Ok" clickable="true" bounds="[0,0][10,10]"/>' +
      '<node text="Broken" clickable="true" bounds="[0,0][10,';
    let elements: ReturnType<typeof parseUiXml> = [];
    assert.doesNotThrow(() => {
      elements = parseUiXml(xml);
    });
    assert.equal(elements.length, 1);
    assert.equal(elements[0].label, "Ok");
  });

  it("skips a node that is missing bounds", () => {
    const xml =
      '<hierarchy><node text="NoBounds" clickable="true"/>' +
      '<node text="HasBounds" clickable="true" bounds="[0,0][20,20]"/></hierarchy>';
    const elements = parseUiXml(xml);
    assert.equal(elements.length, 1);
    assert.equal(elements[0].label, "HasBounds");
  });

  it("handles a literal > inside an attribute value without truncating", () => {
    const xml =
      '<hierarchy><node text="a > b" class="android.widget.TextView" ' +
      'clickable="true" bounds="[0,0][40,40]"/></hierarchy>';
    const elements = parseUiXml(xml);
    const el = elements.find((e) => e.label === "a > b");
    assert.ok(el, "expected label 'a > b' parsed despite the literal >");
    assert.equal(el.x, 20);
    assert.equal(el.y, 20);
  });

  it("returns empty for completely malformed input without throwing", () => {
    let result: ReturnType<typeof parseUiXml> = [];
    assert.doesNotThrow(() => {
      result = parseUiXml("<<<not xml at all >>> <node");
    });
    assert.deepEqual(result, []);
  });
});
