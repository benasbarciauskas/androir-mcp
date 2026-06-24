import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { quoteInputText, shellQuote } from "../dist/tools.js";

// These assert the exact DEVICE-shell argument produced for `input text`.
// The argument is a single token that the device's /system/bin/sh re-parses;
// after that parse, `input text` must receive the literal string (with %s for
// spaces). We verify the produced token AND simulate the device-shell + input
// decode to confirm the text appears verbatim.

/** Simulate /system/bin/sh consuming ONE single-quoted token -> literal bytes. */
function deviceShellUnquote(token: string): string {
  // Mirrors POSIX single-quote handling: '...' is literal; '\'' = a literal '.
  let out = "";
  let i = 0;
  while (i < token.length) {
    const ch = token[i];
    if (ch === "'") {
      // opening quote; consume until closing quote
      i++;
      while (i < token.length && token[i] !== "'") {
        out += token[i];
        i++;
      }
      i++; // skip closing quote
    } else if (ch === "\\") {
      // backslash-escaped char outside quotes (the '\'' bridge)
      i++;
      if (i < token.length) {
        out += token[i];
        i++;
      }
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

/** Simulate `input text` decoding: %s -> space, everything else literal. */
function inputTextDecode(arg: string): string {
  return arg.replace(/%s/g, " ");
}

function typedResult(text: string): string {
  return inputTextDecode(deviceShellUnquote(quoteInputText(text)));
}

describe("shellQuote", () => {
  it("wraps a plain string in single quotes", () => {
    assert.equal(shellQuote("hello"), "'hello'");
  });

  it("escapes an embedded single quote as the '\\'' bridge", () => {
    assert.equal(shellQuote("it's"), "'it'\\''s'");
  });

  it("leaves every shell metacharacter literal inside the quotes", () => {
    const meta = "a&b|c;d$e`f(g)h!i*j?k";
    assert.equal(shellQuote(meta), "'" + meta + "'");
  });
});

describe("quoteInputText", () => {
  it("replaces spaces with %s inside the quotes", () => {
    assert.equal(quoteInputText("a b"), "'a%sb'");
  });

  it("does not over-escape ordinary metacharacters (the original bug)", () => {
    // a&b must NOT become a\&b; ! must NOT become \!; * must NOT become \*.
    assert.equal(quoteInputText("a&b"), "'a&b'");
    assert.equal(quoteInputText("!"), "'!'");
    assert.equal(quoteInputText("*"), "'*'");
  });

  it("handles a single quote via the '\\'' bridge", () => {
    assert.equal(quoteInputText("it's"), "'it'\\''s'");
  });

  it("types each tricky input verbatim after device-shell + input decode", () => {
    const cases = [
      "a b", // space
      "a&b", // ampersand
      "a|b", // pipe
      "a;b", // semicolon
      "a$b", // dollar
      "a`b", // backtick
      "a(b)c", // parens
      "hi!", // bang
      "a*b", // glob star
      "a?b", // glob question
      "it's", // single quote
      'say "hi"', // double quote
      "café", // unicode
      "100% done", // lone percent (NOT %s)
    ];
    for (const input of cases) {
      assert.equal(
        typedResult(input),
        input,
        `expected "${input}" to type verbatim`,
      );
    }
  });

  it("documents the one input-text limitation: a literal %s becomes a space", () => {
    // This is a property of `input text` itself, not the quoting. Asserted so
    // the behaviour is intentional and visible, not a silent surprise.
    assert.equal(typedResult("a%sb"), "a b");
  });
});
