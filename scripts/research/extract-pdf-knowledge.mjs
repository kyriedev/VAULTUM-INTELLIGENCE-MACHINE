import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { extractAsciiRuns } from './extract-pdf-fallback.mjs';
import { extractPdfText, normalizeText, scoreExtractedText } from './extract-pdf-text.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OCR_SOURCE_PATH = path.resolve(ROOT_DIR, 'scripts', 'research', 'pdf-ocr-helper.cs');
const OCR_BINARY_DIR = path.resolve(ROOT_DIR, 'tmp', 'research');
const OCR_BINARY_PATH = path.join(OCR_BINARY_DIR, 'pdf-ocr-helper.exe');
const CSC_CANDIDATES = [
  'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
  'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe',
];
const WINDOWS_WINMD_CANDIDATES = [
  'C:\\Program Files (x86)\\Windows Kits\\10\\UnionMetadata\\10.0.26100.0\\Windows.winmd',
  'C:\\Program Files (x86)\\Windows Kits\\10\\UnionMetadata\\10.0.22621.0\\Windows.winmd',
  'C:\\Program Files (x86)\\Windows Kits\\10\\UnionMetadata\\10.0.22000.0\\Windows.winmd',
];
const SYSTEM_RUNTIME_CANDIDATES = [
  'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\System.Runtime.dll',
  'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\System.Runtime.dll',
];
const SYSTEM_RUNTIME_WINRT_CANDIDATES = [
  'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\System.Runtime.WindowsRuntime.dll',
  'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\System.Runtime.WindowsRuntime.dll',
];

const DOMAIN_HINTS = {
  structure: /\b(structure|trend|range|impulse|correction|continuation|reversal|bos|choch|liquidity|sweep|displacement|fvg|order block|premium|discount|supply|demand)\b/i,
  macro: /\b(macro|policy|central bank|rates|yield|inflation|growth|dollar|dxy|risk sentiment|liquidity|cycle|quantamental)\b/i,
  forex: /\b(forex|fx|currency|pair|base currency|quote currency|carry|session|london|new york|tokyo|boj|ecb|boe|fed|usd|eur|gbp|jpy)\b/i,
  quant: /\b(garch|arch|arima|kalman|regression|markov|hidden markov|hmm|monte carlo|neural network|volatility|state space|time series|forecast)\b/i,
  reflexivity: /\b(reflexiv|boom-bust|feedback loop|self-reinforcing|pyramid|soros)\b/i,
};

const DEFINITION_PATTERNS = [
  /\bis defined as\b/i,
  /\brefers to\b/i,
  /\bmeans\b/i,
  /\bcan be described as\b/i,
  /\bis the process of\b/i,
];
const METHOD_PATTERNS = [
  /\buse\b/i,
  /\bapply\b/i,
  /\bwait for\b/i,
  /\bidentify\b/i,
  /\bestimate\b/i,
  /\bmodel\b/i,
  /\bcalculate\b/i,
  /\bfilter\b/i,
  /\bentry\b/i,
  /\bexecution\b/i,
];
const EXAMPLE_PATTERNS = [
  /\bexample\b/i,
  /\bfor instance\b/i,
  /\bsuch as\b/i,
  /\be\.g\.\b/i,
  /\bconsider\b/i,
];
const CONTEXT_PATTERNS = [
  /\bwhen\b/i,
  /\bduring\b/i,
  /\bif\b/i,
  /\bonly when\b/i,
  /\bmatters\b/i,
  /\bavoid\b/i,
  /\bdo not\b/i,
];
const LIMITATION_PATTERNS = [
  /\blimit/i,
  /\blag/i,
  /\bnoise\b/i,
  /\bweak/i,
  /\bfail/i,
  /\bhowever\b/i,
  /\bassum/i,
  /\boverfit/i,
  /\bnot\b/i,
];
const VISUAL_PATTERNS = [
  /\bchart\b/i,
  /\bfigure\b/i,
  /\bdiagram\b/i,
  /\bplot\b/i,
  /\btable\b/i,
];
const PDF_NOISE_PATTERNS = [
  /\b(?:xref|endobj|endstream|startxref|trailer)\b/i,
  /\/(?:Length|Filter|Type|Subtype|MediaBox|ColorSpace|BitsPerComponent|ProcSet|Font|Resources|Annots)\b/,
  /^\d+\s+\d+\s+obj\b/i,
  /^%PDF-/i,
];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function resolveExistingPath(candidates, label) {
  const match = candidates.find((candidate) => fs.existsSync(candidate));
  if (!match) {
    throw new Error(`Unable to locate ${label}.`);
  }
  return match;
}

function ensureOcrHelper() {
  ensureDir(OCR_BINARY_DIR);
  const binaryExists = fs.existsSync(OCR_BINARY_PATH);
  const sourceMtime = fs.statSync(OCR_SOURCE_PATH).mtimeMs;
  const binaryMtime = binaryExists ? fs.statSync(OCR_BINARY_PATH).mtimeMs : 0;
  if (binaryExists && binaryMtime >= sourceMtime) {
    return OCR_BINARY_PATH;
  }

  const cscPath = resolveExistingPath(CSC_CANDIDATES, 'C# compiler');
  const windowsWinmd = resolveExistingPath(WINDOWS_WINMD_CANDIDATES, 'Windows.winmd');
  const systemRuntime = resolveExistingPath(SYSTEM_RUNTIME_CANDIDATES, 'System.Runtime.dll');
  const systemRuntimeWinRt = resolveExistingPath(SYSTEM_RUNTIME_WINRT_CANDIDATES, 'System.Runtime.WindowsRuntime.dll');

  execFileSync(
    cscPath,
    [
      '/nologo',
      '/target:exe',
      `/out:${OCR_BINARY_PATH}`,
      `/reference:${systemRuntime}`,
      `/reference:${systemRuntimeWinRt}`,
      `/reference:${windowsWinmd}`,
      OCR_SOURCE_PATH,
    ],
    {
      stdio: 'pipe',
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    },
  );

  return OCR_BINARY_PATH;
}

function loadOcrSidecar(filePath) {
  const sidecarDir = process.env.VAULTUM_OCR_SIDECAR_DIR;
  if (!sidecarDir) {
    return null;
  }

  const sidecarPath = path.join(path.resolve(sidecarDir), `${path.basename(filePath)}.ocr.json`);
  if (!fs.existsSync(sidecarPath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(sidecarPath, 'utf8').replace(/^\uFEFF/, ''));
}

function runOcrExtraction(filePath, maxPages = 0) {
  const sidecar = loadOcrSidecar(filePath);
  if (sidecar) {
    return sidecar;
  }

  const helperPath = ensureOcrHelper();
  const args = [filePath];
  if (Number.isFinite(maxPages) && maxPages > 0) {
    args.push(String(maxPages));
  }

  const output = execFileSync(helperPath, args, {
    stdio: 'pipe',
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(output);
}

function splitBlocks(text) {
  return normalizeText(text)
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length >= 12);
}

function isPdfNoiseBlock(block) {
  const lineCount = block.split('\n').length;
  const slashTokenCount = (block.match(/\/[A-Za-z]+/g) ?? []).length;
  const noiseHits = PDF_NOISE_PATTERNS.reduce((total, pattern) => total + (pattern.test(block) ? 1 : 0), 0);
  return noiseHits >= 1 && (slashTokenCount >= 3 || lineCount >= 6 || block.length <= 220);
}

function sanitizeRecoveredText(text) {
  return normalizeText(
    splitBlocks(text)
      .filter((block) => !isPdfNoiseBlock(block))
      .join('\n\n'),
  );
}

function isReadableBlock(block) {
  const cleaned = normalizeText(block);
  if (!cleaned || cleaned.length < 20) {
    return false;
  }

  const alphaCount = (cleaned.match(/[A-Za-z]/g) ?? []).length;
  const controlCount = (cleaned.match(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g) ?? []).length;
  const weirdSequenceCount = (cleaned.match(/[A-Za-z0-9]{5,}\\u0003|[A-Za-z0-9]{4,}\\\\{2,}|[A-Za-z0-9]{5,}'[A-Za-z0-9]{5,}/g) ?? []).length;
  const tokenCount = cleaned.split(/\s+/).filter(Boolean).length;
  const alphaRatio = cleaned.length ? alphaCount / cleaned.length : 0;
  return alphaRatio >= 0.45 && controlCount === 0 && weirdSequenceCount === 0 && tokenCount >= 5;
}

function filterReadableText(text) {
  return normalizeText(
    splitBlocks(text)
      .filter((block) => isReadableBlock(block))
      .join('\n\n'),
  );
}

function canonicalizeBlock(block) {
  return block
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isDuplicateBlock(candidate, seen) {
  const normalized = canonicalizeBlock(candidate);
  if (!normalized) {
    return true;
  }

  return seen.some((existing) => (
    existing === normalized
    || existing.includes(normalized)
    || normalized.includes(existing)
  ));
}

function mergeSources(sources) {
  const seen = [];
  const merged = [];

  sources
    .filter((source) => source?.text)
    .sort((left, right) => right.priority - left.priority)
    .forEach((source) => {
      splitBlocks(sanitizeRecoveredText(source.text)).forEach((block) => {
        if (isDuplicateBlock(block, seen)) {
          return;
        }
        seen.push(canonicalizeBlock(block));
        merged.push(block);
      });
    });

  return normalizeText(merged.join('\n\n'));
}

function collectSentences(text) {
  const candidates = normalizeText(text)
    .replace(/\n{2,}/g, '. ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => normalizeText(sentence))
    .filter((sentence) => sentence.length >= 40 && sentence.length <= 320);

  return [...new Set(candidates)];
}

function detectDomains(fileName, text) {
  const haystack = `${fileName}\n${text}`;
  return Object.entries(DOMAIN_HINTS)
    .filter(([, pattern]) => pattern.test(haystack))
    .map(([domain]) => domain);
}

function detectPdfType(filePath, textStats, fallbackStats) {
  const fileSize = fs.statSync(filePath).size;
  const thinForSize = textStats.characterCount < Math.min(2500, Math.max(500, Math.round(fileSize / 220)));

  if (textStats.classification === 'text-based' && !thinForSize) {
    return {
      pdfType: 'text-based',
      shouldRunOcr: false,
      reason: 'Embedded text extraction is already strong enough to trust as the primary source.',
    };
  }

  if (textStats.classification === 'mixed' || textStats.characterCount >= 300) {
    return {
      pdfType: 'mixed',
      shouldRunOcr: true,
      reason: 'Embedded text exists but quality is thin or inconsistent, so OCR should fill the missing chart and image-based content.',
    };
  }

  return {
    pdfType: 'image-based',
    shouldRunOcr: true,
    reason: 'Embedded text is too weak for the file size, so OCR should be treated as the primary extraction mode.',
  };
}

function shouldForceOcr(filePath) {
  const pattern = process.env.VAULTUM_FORCE_OCR_PATTERNS;
  if (!pattern) {
    return false;
  }

  try {
    return new RegExp(pattern, 'i').test(path.basename(filePath));
  } catch {
    return false;
  }
}

function extractOutline(text) {
  const lines = normalizeText(text)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const sections = [];
  let current = null;

  for (const line of lines) {
    const isHeading = line.startsWith('# ')
      || (/^[A-Z0-9 &/:-]{4,80}$/.test(line) && line.length <= 80)
      || (/^(chapter|section|lesson|module|introduction|summary|conclusion|setup|guideline|definition|model)\b/i.test(line));

    if (isHeading) {
      if (current) {
        sections.push(current);
      }
      current = { heading: line.replace(/^#\s*/, '').trim(), content: [] };
      continue;
    }

    if (!current) {
      current = { heading: 'Overview', content: [] };
    }
    current.content.push(line);
  }

  if (current) {
    sections.push(current);
  }

  return sections
    .map((section) => ({
      heading: section.heading,
      preview: normalizeText(section.content.join(' ')).slice(0, 260),
    }))
    .filter((section) => section.heading && section.preview);
}

function sentenceScore(sentence, patterns) {
  const lower = sentence.toLowerCase();
  const patternHits = patterns.reduce((total, pattern) => total + (pattern.test(sentence) ? 1 : 0), 0);
  const domainHits = Object.values(DOMAIN_HINTS).reduce((total, pattern) => total + (pattern.test(lower) ? 1 : 0), 0);
  const lengthWeight = 1 - Math.abs(140 - sentence.length) / 180;
  return patternHits * 3 + domainHits + Math.max(0, lengthWeight);
}

function uniqueRankedSentences(sentences, patterns, limit, extraFilter = () => true) {
  return sentences
    .filter((sentence) => patterns.some((pattern) => pattern.test(sentence)))
    .filter(extraFilter)
    .map((sentence) => ({
      sentence,
      score: sentenceScore(sentence, patterns),
    }))
    .sort((left, right) => right.score - left.score || right.sentence.length - left.sentence.length)
    .map((item) => item.sentence)
    .filter((sentence, index, array) => array.findIndex((candidate) => canonicalizeBlock(candidate) === canonicalizeBlock(sentence)) === index)
    .slice(0, limit);
}

function extractKeyTerms(text) {
  const termPatterns = [
    'major structure',
    'minor structure',
    'impulse',
    'correction',
    'continuation',
    'reversal',
    'liquidity sweep',
    'displacement',
    'order block',
    'fair value gap',
    'premium',
    'discount',
    'macro pressure',
    'macro context',
    'regime transition',
    'garch',
    'arima',
    'kalman filter',
    'regime switching',
    'hidden markov',
    'linear regression',
    'monte carlo',
    'neural network',
    'reflexivity',
    'rates differentials',
    'session',
  ];

  const lower = text.toLowerCase();
  return termPatterns.filter((term) => lower.includes(term)).slice(0, 18);
}

function detectTopic(fileName, outline, text) {
  const firstHeading = outline[0]?.heading;
  if (firstHeading && firstHeading.toLowerCase() !== 'overview') {
    return firstHeading;
  }

  const lowerName = fileName.toLowerCase();
  if (lowerName.includes('garch') || lowerName.includes('arch')) return 'ARCH/GARCH volatility modeling';
  if (lowerName.includes('arima')) return 'ARIMA time-series modeling';
  if (lowerName.includes('kalman')) return 'Kalman filter estimation';
  if (lowerName.includes('markov')) return 'Regime-switching / Hidden Markov modeling';
  if (lowerName.includes('regression')) return 'Linear regression analysis';
  if (lowerName.includes('macro')) return 'Macro cycle and macro pressure analysis';
  if (lowerName.includes('reflexiv')) return 'Reflexivity and feedback dynamics';
  if (lowerName.includes('forex')) return 'Forex mechanics and market structure';
  if (lowerName.includes('market structure')) return 'Market structure and execution framework';

  const firstSentence = collectSentences(text)[0];
  return firstSentence ? firstSentence.slice(0, 120) : path.parse(fileName).name;
}

function inferOperationalUse(domains, topic) {
  const uses = [];
  if (domains.includes('structure')) {
    uses.push('Use it to map major structure first, minor structure second, then wait for execution-layer confirmation inside the zone.');
  }
  if (domains.includes('macro')) {
    uses.push('Use it as a context filter for GOLD, US30, and the FX pairs rather than a standalone trigger.');
  }
  if (domains.includes('forex')) {
    uses.push('Use it to interpret base-vs-quote strength, rates differentials, session timing, and cross construction operationally.');
  }
  if (domains.includes('quant')) {
    uses.push('Use it to choose the right model for the right job instead of forcing one forecasting model across all regimes.');
  }
  if (domains.includes('reflexivity')) {
    uses.push('Use it for winner-only pyramiding, squeeze awareness, and late-stage fragility checks.');
  }
  if (uses.length === 0) {
    uses.push(`Use "${topic}" as supporting context only after structure and live participation are already clear.`);
  }
  return uses.slice(0, 5);
}

function inferLimitations(domains, pdfType, chartInsights) {
  const limitations = [];
  if (pdfType !== 'text-based') {
    limitations.push('Some content was recovered through OCR, so wording may still need manual review on dense mathematical or image-heavy pages.');
  }
  if (domains.includes('quant')) {
    limitations.push('Quant model material should guide model selection and risk framing, not replace live structure and participation confirmation.');
  }
  if (domains.includes('macro')) {
    limitations.push('Macro material is strongest for backdrop and regime pressure, but it does not remove the need for exact intraday price validation.');
  }
  if (domains.includes('structure') && chartInsights.length === 0) {
    limitations.push('The document is structure-relevant, but chart-specific examples were not strongly recoverable as visual insights.');
  }
  return limitations;
}

function summarizeExtractionMode(pdfType, shouldRunOcr, ocrPayload) {
  if (!shouldRunOcr) {
    return 'embedded-text';
  }
  if (pdfType === 'image-based') {
    return 'ocr-primary';
  }
  return ocrPayload ? 'hybrid-text-plus-ocr' : 'text-plus-fallback';
}

function buildKnowledgeDocument(filePath, extraction, mergedText, ocrPayload) {
  const fileName = path.basename(filePath);
  const sentences = collectSentences(mergedText);
  const outline = extractOutline(mergedText);
  const chartInsights = (ocrPayload?.pages ?? [])
    .filter((page) => page.likelyChart)
    .map((page) => ({
      pageNumber: page.pageNumber,
      structure: page.structure,
      chartContext: page.chartContext,
      keyZones: page.keyZones,
      liquidityAreas: page.liquidityAreas,
      reactions: page.reactions,
    }));
  const domains = detectDomains(fileName, mergedText);
  const topic = detectTopic(fileName, outline, mergedText);
  const coreIdeas = uniqueRankedSentences(
    sentences,
    [
      ...DEFINITION_PATTERNS,
      /\bshould\b/i,
      /\bimportant\b/i,
      /\bkey\b/i,
      /\bfoundation\b/i,
      /\btherefore\b/i,
    ],
    6,
    (sentence) => sentenceScore(sentence, [...DEFINITION_PATTERNS, ...METHOD_PATTERNS]) >= 2,
  );
  const definitions = uniqueRankedSentences(
    sentences,
    DEFINITION_PATTERNS,
    8,
    (sentence) => sentenceScore(sentence, DEFINITION_PATTERNS) >= 3,
  );
  const methods = uniqueRankedSentences(
    sentences,
    METHOD_PATTERNS,
    8,
    (sentence) => sentenceScore(sentence, METHOD_PATTERNS) >= 3,
  );
  const examples = uniqueRankedSentences(sentences, EXAMPLE_PATTERNS, 5);
  const contextRules = uniqueRankedSentences(sentences, CONTEXT_PATTERNS, 8);
  const limitations = [
    ...uniqueRankedSentences(sentences, LIMITATION_PATTERNS, 6),
    ...inferLimitations(domains, extraction.pdfType, chartInsights),
  ].filter((value, index, array) => array.findIndex((candidate) => canonicalizeBlock(candidate) === canonicalizeBlock(value)) === index).slice(0, 8);
  const visuals = [
    ...chartInsights.map((page) => `Page ${page.pageNumber}: ${page.chartContext}`),
    ...uniqueRankedSentences(sentences, VISUAL_PATTERNS, 4),
  ].filter((value, index, array) => array.findIndex((candidate) => canonicalizeBlock(candidate) === canonicalizeBlock(value)) === index).slice(0, 8);
  const summary = coreIdeas[0]
    ?? definitions[0]
    ?? methods[0]
    ?? `Recovered ${topic} as structured research support for Vaultum.`;

  return {
    document: fileName,
    topic,
    domains,
    extractionQuality: extraction.pdfType === 'text-based'
      ? 'full'
      : extraction.pdfType === 'mixed'
        ? 'partial'
        : 'partial',
    extractionMode: summarizeExtractionMode(extraction.pdfType, extraction.shouldRunOcr, ocrPayload),
    summary,
    keyTerms: extractKeyTerms(mergedText),
    coreIdeas,
    definitions,
    methods,
    examples,
    contextRules,
    limitations,
    visuals,
    operationalUse: inferOperationalUse(domains, topic),
    outline: outline.slice(0, 16),
    chartInsights,
  };
}

function writeMarkdownSummary(reportPath, results) {
  const lines = [
    '# MACRO TRENDS OCR Knowledge Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
  ];

  results.forEach((result) => {
    lines.push(`## ${result.document}`);
    lines.push(`- topic: ${result.topic}`);
    lines.push(`- pdfType: ${result.pdfType}`);
    lines.push(`- extractionMode: ${result.extractionMode}`);
    lines.push(`- textScore: ${result.textScore}`);
    lines.push(`- ocrUsed: ${result.ocrUsed ? 'yes' : 'no'}`);
    lines.push(`- chartPages: ${result.chartPages}`);
    lines.push(`- domains: ${result.domains.join(', ') || 'none-detected'}`);
    lines.push(`- summary: ${result.summary}`);
    lines.push('');
  });

  fs.writeFileSync(reportPath, `${lines.join('\n').trim()}\n`, 'utf8');
}

function processPdf(filePath, outputDir, maxOcrPages) {
  const forceOcr = shouldForceOcr(filePath);
  const rawText = forceOcr ? '' : filterReadableText(sanitizeRecoveredText(extractPdfText(filePath)));
  const textStats = scoreExtractedText(rawText);
  const fallbackText = sanitizeRecoveredText(extractAsciiRuns(fs.readFileSync(filePath)));
  const fallbackStats = scoreExtractedText(fallbackText, { minLength: 280 });
  const detection = forceOcr
    ? {
      pdfType: 'image-based',
      shouldRunOcr: true,
      reason: 'OCR was forced for this document family because it is known to be image-heavy or slide-based.',
    }
    : detectPdfType(filePath, textStats, fallbackStats);
  const ocrPayload = detection.shouldRunOcr ? runOcrExtraction(filePath, maxOcrPages) : null;
  const ocrText = ocrPayload
    ? normalizeText(
      (ocrPayload.pages ?? [])
        .map((page) => `# Page ${page.pageNumber}\n${page.text ?? ''}`)
        .join('\n\n'),
    )
    : '';
  const useFallback = !ocrPayload && textStats.characterCount < 500;
  const mergedText = detection.pdfType === 'image-based'
    ? sanitizeRecoveredText(ocrText)
    : mergeSources([
      {
        label: 'ocr',
        text: ocrText,
        priority: detection.pdfType === 'image-based' ? 100 : 85,
      },
      {
        label: 'embedded-text',
        text: textStats.normalizedText,
        priority: detection.pdfType === 'text-based' ? 100 : 80,
      },
      {
        label: 'ascii-fallback',
        text: useFallback ? fallbackStats.normalizedText : '',
        priority: 30,
      },
    ]);

  const knowledge = buildKnowledgeDocument(filePath, detection, mergedText, ocrPayload);
  const baseName = path.basename(filePath);
  const jsonPath = path.join(outputDir, `${baseName}.knowledge.json`);
  const mergedTextPath = path.join(outputDir, `${baseName}.merged.txt`);

  fs.writeFileSync(jsonPath, JSON.stringify({
    source: filePath,
    fileName: baseName,
    pdfType: detection.pdfType,
    reason: detection.reason,
    textExtraction: {
      score: textStats.score,
      classification: textStats.classification,
      characterCount: textStats.characterCount,
      lineCount: textStats.lineCount,
      tokenCount: textStats.tokenCount,
      uniqueTokenRatio: textStats.uniqueTokenRatio,
      alphaRatio: textStats.alphaRatio,
    },
    fallbackExtraction: {
      score: fallbackStats.score,
      classification: fallbackStats.classification,
      characterCount: fallbackStats.characterCount,
      lineCount: fallbackStats.lineCount,
      tokenCount: fallbackStats.tokenCount,
      uniqueTokenRatio: fallbackStats.uniqueTokenRatio,
      alphaRatio: fallbackStats.alphaRatio,
    },
    ocrExtraction: ocrPayload ? {
      pageCount: ocrPayload.pageCount,
      ocrLanguage: ocrPayload.ocrLanguage,
      pagesWithCharts: (ocrPayload.pages ?? []).filter((page) => page.likelyChart).length,
      pages: ocrPayload.pages,
    } : null,
    mergedText,
    knowledge,
  }, null, 2), 'utf8');
  fs.writeFileSync(mergedTextPath, `${mergedText}\n`, 'utf8');

  return {
    document: baseName,
    topic: knowledge.topic,
    pdfType: detection.pdfType,
    extractionMode: knowledge.extractionMode,
    textScore: textStats.score,
    fallbackScore: fallbackStats.score,
    ocrUsed: Boolean(ocrPayload),
    chartPages: knowledge.chartInsights.length,
    domains: knowledge.domains,
    summary: knowledge.summary,
    jsonPath,
    mergedTextPath,
  };
}

function resolveInputFiles(inputPath) {
  const fullPath = path.resolve(inputPath);
  const stat = fs.statSync(fullPath);
  if (stat.isDirectory()) {
    return fs.readdirSync(fullPath)
      .filter((name) => name.toLowerCase().endsWith('.pdf'))
      .sort((left, right) => left.localeCompare(right))
      .map((name) => path.join(fullPath, name));
  }
  return [fullPath];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];
  const maxOcrPagesArg = Number.parseInt(process.argv[4] ?? '', 10);

  if (!inputPath || !outputPath) {
    console.error('Usage: node scripts/research/extract-pdf-knowledge.mjs <input-path> <output-dir> [max-ocr-pages]');
    process.exit(1);
  }

  const outputDir = path.resolve(outputPath);
  ensureDir(outputDir);

  const files = resolveInputFiles(inputPath);
  const results = files.map((file) => processPdf(file, outputDir, Number.isFinite(maxOcrPagesArg) ? maxOcrPagesArg : 0));
  const summaryPath = path.join(outputDir, 'knowledge-summary.json');
  const reportPath = path.join(outputDir, 'knowledge-summary.md');
  fs.writeFileSync(summaryPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: path.resolve(inputPath),
    documents: results,
  }, null, 2), 'utf8');
  writeMarkdownSummary(reportPath, results);

  console.log(`KNOWLEDGE_EXTRACTED ${files.length} PDF(s) -> ${outputDir}`);
}
