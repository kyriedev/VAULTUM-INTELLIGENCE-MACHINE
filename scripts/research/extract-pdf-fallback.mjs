import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function normalizeText(value) {
  return value
    .replace(/\u0000/g, '')
    .replace(/[^\S\r\n]+/g, ' ')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function extractAsciiRuns(buffer, minRun = 6, maxCharacters = 80_000) {
  const chunks = [];
  let run = '';

  for (const byte of buffer) {
    const printable =
      byte === 9
      || byte === 10
      || byte === 13
      || (byte >= 32 && byte <= 126);
    if (printable) {
      run += String.fromCharCode(byte);
      continue;
    }

    if (run.length >= minRun) {
      chunks.push(run);
      if (chunks.join('\n').length >= maxCharacters) break;
    }
    run = '';
  }

  if (run.length >= minRun && chunks.join('\n').length < maxCharacters) {
    chunks.push(run);
  }

  return normalizeText(chunks.join('\n')).slice(0, maxCharacters);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const inputPath = process.argv[2];
  const outputDir = process.argv[3];

  if (!inputPath || !outputDir) {
    console.error('Usage: node scripts/research/extract-pdf-fallback.mjs <input-pdf> <output-dir>');
    process.exit(1);
  }

  const sourcePath = path.resolve(inputPath);
  const targetDir = path.resolve(outputDir);
  ensureDir(targetDir);

  const buffer = fs.readFileSync(sourcePath);
  const text = extractAsciiRuns(buffer);
  const targetPath = path.join(targetDir, `${path.basename(sourcePath)}.fallback.txt`);
  fs.writeFileSync(targetPath, text, 'utf8');
  console.log(`FALLBACK_EXTRACTED ${path.basename(sourcePath)} -> ${targetPath}`);
}
