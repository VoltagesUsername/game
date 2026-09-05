#!/usr/bin/env node
/* Extracts the artifact payload from index.html.
   index.html is the standalone page; dist/artifact.html is the same
   content without the document skeleton, which the Artifact host supplies. */
const fs = require("fs"), path = require("path");
const src = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const m = src.match(/<!-- ARTIFACT:START -->\n([\s\S]*?)\n<!-- ARTIFACT:END -->/);
if (!m) { console.error("build: artifact markers not found in index.html"); process.exit(1); }
const out = path.join(__dirname, "dist", "artifact.html");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, m[1]);
console.log(`build: dist/artifact.html — ${(m[1].length/1024).toFixed(1)} KB, ${m[1].split("\n").length} lines`);
