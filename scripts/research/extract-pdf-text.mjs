import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import zlib from 'node:zlib';

export function decodePdfString(str) {
  return str
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '')
    .replace(/\\t/g, '\t')
    .replace(/\\([0-7]{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
}

export function normalizeText(value) {
  return value
    .replace(/\u0000/g, '')
    .replace(/â€¢/g, '-')
    .replace(/â€”/g, '-')
    .replace(/â€“/g, '-')
    .replace(/â€˜|â€™/g, "'")
    .replace(/â€œ|â€�/g, '"')
    .replace(/Â·/g, '-')
    .replace(/Â/g, '')
    .replace(/[^\S\r\n]+/g, ' ')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function extractPdfText(filePath, options = {}) {
  const maxChunks = Number.isFinite(options.maxChunks) ? options.maxChunks : 240;
  const maxCharacters = Number.isFinite(options.maxCharacters) ? options.maxCharacters : 120_000;
  const buffer = fs.readFileSync(filePath);
  const raw = buffer.toString('latin1');
  const chunks = [];

  let idx = 0;
  while ((idx = raw.indexOf('stream', idx)) !== -1 && chunks.length < maxChunks) {
    let start = idx + 6;
    if (raw[start] === '\r' && raw[start + 1] === '\n') start += 2;
    else if (raw[start] === '\n') start += 1;

    const end = raw.indexOf('endstream', start);
    if (end === -1) break;

    const slice = buffer.subarray(start, end);
    idx = end + 9;

    let text = null;
    try {
      text = zlib.inflateSync(slice).toString('latin1');
    } catch {}

    if (!text) {
      try {
        text = zlib.inflateRawSync(slice).toString('latin1');
      } catch {}
    }

    if (!text) text = slice.toString('latin1');
    if (/(BT|TJ|Tj|Tf)/.test(text)) chunks.push(text);
  }

  const texts = [];
  let totalLength = 0;
  for (const chunk of chunks) {
    const singleMatches = [...chunk.matchAll(/\(([^()]*(?:\\.[^()]*)*)\)\s*Tj/g)];
    for (const match of singleMatches) {
      const value = decodePdfString(match[1]);
      texts.push(value);
      totalLength += value.length;
      if (totalLength >= maxCharacters) break;
    }
    if (totalLength >= maxCharacters) break;

    const arrayMatches = [...chunk.matchAll(/\[(.*?)\]\s*TJ/gs)];
    for (const arrayMatch of arrayMatches) {
      const parts = [...arrayMatch[1].matchAll(/\(([^()]*(?:\\.[^()]*)*)\)/g)];
      if (!parts.length) continue;
      const value = parts.map((part) => decodePdfString(part[1])).join('');
      texts.push(value);
      totalLength += value.length;
      if (totalLength >= maxCharacters) break;
    }
    if (totalLength >= maxCharacters) break;
  }

  return normalizeText(texts.join('\n')).slice(0, maxCharacters);
}

export function scoreExtractedText(text, options = {}) {
  const normalized = normalizeText(text);
  const minLength = Number.isFinite(options.minLength) ? options.minLength : 600;
  const lines = normalized ? normalized.split('\n').map((line) => line.trim()).filter(Boolean) : [];
  const tokens = normalized
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
  const uniqueTokens = new Set(tokens);
  const alphaCharacters = (normalized.match(/[a-z]/gi) ?? []).length;
  const digitCharacters = (normalized.match(/\d/g) ?? []).length;
  const punctuationCharacters = (normalized.match(/[.,;:!?()[\]{}"'`-]/g) ?? []).length;
  const suspiciousCharacters = (normalized.match(/[^\x09\x0a\x0d\x20-\x7e]/g) ?? []).length;
  const pdfMarkupMatches = (normalized.match(/\b(?:xref|endobj|endstream|startxref|trailer|obj)\b|\/(?:Length|Filter|Type|Subtype|MediaBox|ColorSpace|BitsPerComponent|ProcSet|Font|Resources)\b/g) ?? []).length;
  const headingLikeLines = lines.filter((line) => {
    if (line.length === 0 || line.length > 80) {
      return false;
    }
    const letters = (line.match(/[a-z]/gi) ?? []).length;
    const upper = (line.match(/[A-Z]/g) ?? []).length;
    return letters >= 4 && upper >= Math.max(3, letters - 2);
  }).length;
  const averageLineLength = lines.length
    ? lines.reduce((sum, line) => sum + line.length, 0) / lines.length
    : 0;
  const alphaRatio = normalized.length ? alphaCharacters / normalized.length : 0;
  const suspiciousRatio = normalized.length ? suspiciousCharacters / normalized.length : 1;
  const punctuationRatio = normalized.length ? punctuationCharacters / normalized.length : 0;
  const digitRatio = normalized.length ? digitCharacters / normalized.length : 0;
  const lengthScore = Math.min(1, normalized.length / minLength);
  const lexicalScore = tokens.length ? Math.min(1, uniqueTokens.size / Math.max(40, tokens.length * 0.55)) : 0;
  const alphaScore = Math.min(1, alphaRatio / 0.65);
  const cleanlinessScore = Math.max(0, 1 - suspiciousRatio * 8);
  const structureScore = Math.min(1, (headingLikeLines * 0.12) + Math.min(0.6, averageLineLength / 90));
  const formattingScore = Math.max(0, 1 - Math.abs(punctuationRatio - 0.05) * 8 - Math.max(0, digitRatio - 0.18) * 3);
  const markupPenalty = Math.min(0.45, pdfMarkupMatches / Math.max(18, lines.length * 0.4));
  const rawScore = (
    lengthScore * 0.28
    + lexicalScore * 0.18
    + alphaScore * 0.18
    + cleanlinessScore * 0.2
    + structureScore * 0.08
    + formattingScore * 0.08
  );
  const score = Number(Math.max(0, rawScore - markupPenalty).toFixed(3));

  let classification = 'image-based';
  if (score >= 0.74 && normalized.length >= minLength) {
    classification = 'text-based';
  } else if (score >= 0.4 && normalized.length >= Math.max(240, minLength * 0.25)) {
    classification = 'mixed';
  }

  return {
    score,
    classification,
    characterCount: normalized.length,
    lineCount: lines.length,
    tokenCount: tokens.length,
    uniqueTokenRatio: tokens.length ? Number((uniqueTokens.size / tokens.length).toFixed(3)) : 0,
    alphaRatio: Number(alphaRatio.toFixed(3)),
    suspiciousRatio: Number(suspiciousRatio.toFixed(3)),
    pdfMarkupMatches,
    averageLineLength: Number(averageLineLength.toFixed(1)),
    normalizedText: normalized,
  };
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const inputDir = process.argv[2];
  const outputDir = process.argv[3];
  const maxChunksArg = Number.parseInt(process.argv[4] ?? '', 10);
  const maxCharactersArg = Number.parseInt(process.argv[5] ?? '', 10);

  if (!inputDir || !outputDir) {
    console.error('Usage: node scripts/research/extract-pdf-text.mjs <input-dir> <output-dir>');
    process.exit(1);
  }

  const sourceDir = path.resolve(inputDir);
  const targetDir = path.resolve(outputDir);

  ensureDir(targetDir);

  const sourceStat = fs.statSync(sourceDir);
  const files = sourceStat.isDirectory()
    ? fs.readdirSync(sourceDir)
      .filter((name) => name.toLowerCase().endsWith('.pdf'))
      .sort((left, right) => left.localeCompare(right))
      .map((name) => ({
        name,
        sourcePath: path.join(sourceDir, name),
        targetPath: path.join(targetDir, `${name}.txt`),
      }))
    : [{
      name: path.basename(sourceDir),
      sourcePath: sourceDir,
      targetPath: path.join(targetDir, `${path.basename(sourceDir)}.txt`),
    }];

  for (const file of files) {
    const text = extractPdfText(file.sourcePath, {
      maxChunks: Number.isFinite(maxChunksArg) ? maxChunksArg : undefined,
      maxCharacters: Number.isFinite(maxCharactersArg) ? maxCharactersArg : undefined,
    });
    fs.writeFileSync(file.targetPath, text, 'utf8');
    console.log(`EXTRACTED ${file.name} -> ${file.targetPath}`);
  }
}
