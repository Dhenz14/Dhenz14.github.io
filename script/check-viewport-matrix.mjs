#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const matrix = fs.readFileSync(path.join(root, "docs/VIEWPORT_MATRIX.md"), "utf8");
const assert = (condition, message) => { if (!condition) throw new Error(message); };

assert(/window\.innerWidth/u.test(matrix), "viewport matrix omits innerWidth");
assert(/document\.documentElement\.scrollWidth/u.test(matrix), "viewport matrix omits scrollWidth");
assert(/visualViewport\.width/u.test(matrix), "viewport matrix omits visualViewport.width");
assert(/AMBIGUOUS/u.test(matrix), "page-scale row lacks AMBIGUOUS disposition");
assert(/Browser zoom 150%/u.test(matrix) && /setPageScaleFactor\(1\.5\)/u.test(matrix), "zoom vs page-scale distinction drifted");
assert(/panning allowed/u.test(matrix), "page-scale pan policy is undefined");

console.log("VIEWPORT_MATRIX_CONTRACT_OK zoom=reflow pageScale=ambiguous-unless-pan-defined");
