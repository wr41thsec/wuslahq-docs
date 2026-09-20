// Runs verify-origin.mjs against the published vectors. Exit 0 iff every
// vector reaches its expected verdict.
//
//   node run-vectors.mjs            (from this folder; the vectors sit one level up)
//
// Kept apart from verify-origin.mjs on purpose: the verifier must stay free of
// Node-only imports so the workbench on the spec page can import it as-is.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { verify } from './verify-origin.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] || join(here, '..', 'spec-1-test-vectors.json');
const { testKey, now, skewSec, vectors } = JSON.parse(readFileSync(file, 'utf8'));

const seenNonces = new Set();   // ONE shared set, vectors in file order — that is what fails the replay vector
let failed = 0;
for (const v of vectors) {
  const r = await verify(testKey, v.headers, v.method, v.path, v.body, { skewSec, nowSec: now, seenNonces });
  const got = r.ok ? 'pass' : 'fail';
  const mark = got === v.expect ? 'ok  ' : 'MISMATCH';
  if (got !== v.expect) failed++;
  console.log(`${mark} ${v.expect.padEnd(4)} ${v.name}${r.reason ? ` (${r.reason})` : ''}`);
}
console.log(failed ? `${failed} vector(s) mismatched` : `all ${vectors.length} vectors agree`);
process.exit(failed ? 1 : 0);
