import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { extractPdfText, scoreExtractedText } from './extract-pdf-text.mjs';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error('Usage: node scripts/research/inspect-pdf-text.mjs <input-pdf>');
    process.exit(1);
  }

  const resolvedPath = path.resolve(inputPath);
  const text = extractPdfText(resolvedPath);
  const score = scoreExtractedText(text);
  const payload = {
    file: resolvedPath,
    sizeBytes: fs.statSync(resolvedPath).size,
    score: score.score,
    classification: score.classification,
    characterCount: score.characterCount,
    lineCount: score.lineCount,
    tokenCount: score.tokenCount,
    uniqueTokenRatio: score.uniqueTokenRatio,
    alphaRatio: score.alphaRatio,
    suspiciousRatio: score.suspiciousRatio,
    pdfMarkupMatches: score.pdfMarkupMatches,
    averageLineLength: score.averageLineLength,
  };

  console.log(JSON.stringify(payload));
}
