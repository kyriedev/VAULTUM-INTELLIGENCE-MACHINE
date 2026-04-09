using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices.WindowsRuntime;
using System.Text;
using System.Text.RegularExpressions;
using Windows.Data.Pdf;
using Windows.Graphics.Imaging;
using Windows.Media.Ocr;
using Windows.Storage;
using Windows.Storage.Streams;

namespace VaultumResearch
{
    internal static class PdfOcrHelper
    {
        private sealed class PageData
        {
            public int PageNumber;
            public string Text;
            public bool LikelyChart;
            public string ChartContext;
            public string Structure;
            public List<string> KeyZones;
            public List<string> LiquidityAreas;
            public List<string> Reactions;

            public PageData()
            {
                Text = string.Empty;
                ChartContext = string.Empty;
                Structure = "unknown";
                KeyZones = new List<string>();
                LiquidityAreas = new List<string>();
                Reactions = new List<string>();
            }
        }

        private sealed class DocumentData
        {
            public string Source;
            public int PageCount;
            public string OcrLanguage;
            public string MergedText;
            public List<PageData> Pages;

            public DocumentData()
            {
                Source = string.Empty;
                OcrLanguage = "unknown";
                MergedText = string.Empty;
                Pages = new List<PageData>();
            }
        }

        public static int Main(string[] args)
        {
            if (args.Length < 1)
            {
                Console.Error.WriteLine("Usage: pdf-ocr-helper <input-pdf> [max-pages]");
                return 1;
            }

            try
            {
                string inputPath = Path.GetFullPath(args[0]);
                if (!File.Exists(inputPath))
                {
                    Console.Error.WriteLine("Input PDF not found: " + inputPath);
                    return 2;
                }

                int maxPages = 0;
                if (args.Length >= 2)
                {
                    int.TryParse(args[1], out maxPages);
                    if (maxPages < 0)
                    {
                        maxPages = 0;
                    }
                }

                DocumentData payload = ProcessDocument(inputPath, maxPages);
                Console.OutputEncoding = Encoding.UTF8;
                Console.WriteLine(ToJson(payload));
                return 0;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine(ex.ToString());
                return 3;
            }
        }

        private static DocumentData ProcessDocument(string inputPath, int maxPages)
        {
            StorageFile file = StorageFile.GetFileFromPathAsync(inputPath).AsTask().GetAwaiter().GetResult();
            PdfDocument pdf = PdfDocument.LoadFromFileAsync(file).AsTask().GetAwaiter().GetResult();
            OcrEngine ocr = OcrEngine.TryCreateFromUserProfileLanguages();
            if (ocr == null)
            {
                throw new InvalidOperationException("Windows OCR engine is not available for the current user profile.");
            }

            int pageCount = (int)pdf.PageCount;
            int limit = maxPages > 0 ? Math.Min(pageCount, maxPages) : pageCount;
            DocumentData document = new DocumentData();
            document.Source = inputPath;
            document.PageCount = pageCount;
            document.OcrLanguage = ocr.RecognizerLanguage != null ? ocr.RecognizerLanguage.LanguageTag : "unknown";

            List<string> mergedBlocks = new List<string>();
            uint index = 0;
            while (index < limit)
            {
                using (PdfPage page = pdf.GetPage(index))
                using (InMemoryRandomAccessStream stream = new InMemoryRandomAccessStream())
                {
                    page.RenderToStreamAsync(stream).AsTask().GetAwaiter().GetResult();
                    stream.Seek(0);

                    BitmapDecoder decoder = BitmapDecoder.CreateAsync(stream).AsTask().GetAwaiter().GetResult();
                    SoftwareBitmap bitmap = decoder.GetSoftwareBitmapAsync().AsTask().GetAwaiter().GetResult();
                    SoftwareBitmap normalizedBitmap = NormalizeBitmap(bitmap);
                    OcrResult result = ocr.RecognizeAsync(normalizedBitmap).AsTask().GetAwaiter().GetResult();

                    PageData pageData = BuildPageData((int)index + 1, result);
                    document.Pages.Add(pageData);
                    if (!string.IsNullOrWhiteSpace(pageData.Text))
                    {
                        mergedBlocks.Add("# Page " + pageData.PageNumber + "\n" + pageData.Text);
                    }
                }

                index += 1;
            }

            document.MergedText = NormalizeText(string.Join("\n\n", mergedBlocks.ToArray()));
            return document;
        }

        private static SoftwareBitmap NormalizeBitmap(SoftwareBitmap bitmap)
        {
            if (bitmap.BitmapPixelFormat == BitmapPixelFormat.Bgra8
                && bitmap.BitmapAlphaMode == BitmapAlphaMode.Premultiplied)
            {
                return bitmap;
            }

            return SoftwareBitmap.Convert(bitmap, BitmapPixelFormat.Bgra8, BitmapAlphaMode.Premultiplied);
        }

        private static PageData BuildPageData(int pageNumber, OcrResult result)
        {
            List<string> lineTexts = new List<string>();
            foreach (var line in result.Lines)
            {
                string text = NormalizeLine(line.Text);
                if (!string.IsNullOrWhiteSpace(text))
                {
                    lineTexts.Add(text);
                }
            }

            string pageText = NormalizeText(RebuildStructuredText(lineTexts));
            bool likelyChart = DetectLikelyChart(lineTexts, pageText);
            string structure = InferStructure(pageText);
            List<string> keyZones = ExtractMatches(pageText, new[]
            {
                @"(?:demand|supply|support|resistance|order block|fair value gap|fvg|ob)[^.\n]{0,120}",
                @"(?:zone|entry|stop|target)[^.\n]{0,120}",
                @"\b\d{3,5}(?:\.\d+)?\s*(?:-|to)\s*\d{3,5}(?:\.\d+)?\b"
            }, 6);
            List<string> liquidityAreas = ExtractMatches(pageText, new[]
            {
                @"(?:liquidity|sweep|stop run|equal highs|equal lows|buy-side|sell-side)[^.\n]{0,120}",
                @"(?:highs|lows|external|internal liquidity)[^.\n]{0,120}"
            }, 6);
            List<string> reactions = ExtractMatches(pageText, new[]
            {
                @"(?:rejection|reclaim|acceptance|failure|reaction|bounce|displacement|continuation|reversal)[^.\n]{0,140}"
            }, 6);

            PageData page = new PageData();
            page.PageNumber = pageNumber;
            page.Text = pageText;
            page.LikelyChart = likelyChart;
            page.Structure = structure;
            page.KeyZones = keyZones;
            page.LiquidityAreas = liquidityAreas;
            page.Reactions = reactions;
            page.ChartContext = likelyChart ? BuildChartContext(structure, keyZones, liquidityAreas, reactions) : string.Empty;
            return page;
        }

        private static string RebuildStructuredText(List<string> lines)
        {
            if (lines.Count == 0)
            {
                return string.Empty;
            }

            List<string> blocks = new List<string>();
            StringBuilder current = new StringBuilder();

            for (int i = 0; i < lines.Count; i++)
            {
                string line = lines[i];
                bool heading = IsHeading(line);
                if (heading && current.Length > 0)
                {
                    blocks.Add(current.ToString().Trim());
                    current.Clear();
                }

                if (heading)
                {
                    blocks.Add("# " + line.Trim());
                    continue;
                }

                if (current.Length > 0 && !current.ToString().EndsWith("-"))
                {
                    current.Append(" ");
                }
                current.Append(line.Trim());
            }

            if (current.Length > 0)
            {
                blocks.Add(current.ToString().Trim());
            }

            return string.Join("\n\n", RemoveDuplicateBlocks(blocks).ToArray());
        }

        private static IEnumerable<string> RemoveDuplicateBlocks(IEnumerable<string> blocks)
        {
            HashSet<string> seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (string block in blocks)
            {
                string normalized = NormalizeText(block);
                if (normalized.Length == 0)
                {
                    continue;
                }

                if (seen.Add(normalized))
                {
                    yield return normalized;
                }
            }
        }

        private static bool IsHeading(string value)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                return false;
            }

            string trimmed = value.Trim();
            if (trimmed.Length > 90)
            {
                return false;
            }

            int letterCount = trimmed.Count(char.IsLetter);
            int upperCount = trimmed.Count(char.IsUpper);
            bool mostlyUpper = letterCount >= 4 && upperCount >= Math.Max(4, letterCount - 2);
            bool headingKeyword = Regex.IsMatch(trimmed, @"^(chapter|section|lesson|module|introduction|conclusion|summary|setup|guideline|definition|model)\b", RegexOptions.IgnoreCase);
            return mostlyUpper || headingKeyword;
        }

        private static bool DetectLikelyChart(List<string> lines, string pageText)
        {
            if (lines.Count == 0)
            {
                return false;
            }

            int shortLines = lines.Count(functionLine =>
            {
                string[] parts = functionLine.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
                return parts.Length <= 6;
            });
            bool sparseLayout = shortLines >= Math.Max(4, lines.Count / 2);
            bool chartTerms = Regex.IsMatch(pageText.ToLowerInvariant(), @"\b(chart|trend|range|support|resistance|supply|demand|ob|fvg|liquidity|sweep|bos|choch|entry|stop|target)\b");
            bool numericHeavy = Regex.Matches(pageText, @"\b\d{2,5}(?:\.\d+)?\b").Count >= 6;
            return chartTerms && (sparseLayout || numericHeavy);
        }

        private static string InferStructure(string text)
        {
            string lower = text.ToLowerInvariant();
            bool bullish = Regex.IsMatch(lower, @"\b(uptrend|bullish|higher high|higher low|hh|hl)\b");
            bool bearish = Regex.IsMatch(lower, @"\b(downtrend|bearish|lower high|lower low|lh|ll)\b");
            bool range = Regex.IsMatch(lower, @"\b(range|sideways|consolidation|balance)\b");
            if (bullish && !bearish)
            {
                return "uptrend";
            }

            if (bearish && !bullish)
            {
                return "downtrend";
            }

            if (range)
            {
                return "range";
            }

            return "unknown";
        }

        private static List<string> ExtractMatches(string text, IEnumerable<string> patterns, int limit)
        {
            List<string> results = new List<string>();
            foreach (string pattern in patterns)
            {
                MatchCollection matches = Regex.Matches(text, pattern, RegexOptions.IgnoreCase);
                foreach (Match match in matches)
                {
                    string value = NormalizeText(match.Value);
                    if (value.Length < 6)
                    {
                        continue;
                    }

                    bool exists = results.Any(existing => existing.Equals(value, StringComparison.OrdinalIgnoreCase));
                    if (exists)
                    {
                        continue;
                    }

                    results.Add(value);
                    if (results.Count >= limit)
                    {
                        return results;
                    }
                }
            }

            return results;
        }

        private static string BuildChartContext(string structure, List<string> keyZones, List<string> liquidityAreas, List<string> reactions)
        {
            List<string> parts = new List<string>();
            if (structure == "uptrend")
            {
                parts.Add("Chart likely shows bullish structure.");
            }
            else if (structure == "downtrend")
            {
                parts.Add("Chart likely shows bearish structure.");
            }
            else if (structure == "range")
            {
                parts.Add("Chart likely shows range or balance.");
            }
            else
            {
                parts.Add("Chart structure is not cleanly classified.");
            }

            if (keyZones.Count > 0)
            {
                parts.Add("Key zones: " + string.Join(" | ", keyZones.Take(3).ToArray()));
            }

            if (liquidityAreas.Count > 0)
            {
                parts.Add("Liquidity areas: " + string.Join(" | ", liquidityAreas.Take(3).ToArray()));
            }

            if (reactions.Count > 0)
            {
                parts.Add("Reactions: " + string.Join(" | ", reactions.Take(3).ToArray()));
            }

            return NormalizeText(string.Join(" ", parts.ToArray()));
        }

        private static string NormalizeLine(string value)
        {
            return value
                .Replace('\0', ' ')
                .Replace("\r", " ")
                .Replace("\n", " ")
                .Trim();
        }

        private static string NormalizeText(string value)
        {
            string text = value
                .Replace("\0", string.Empty)
                .Replace("\r", string.Empty)
                .Replace("-\n", string.Empty)
                .Replace("\t", " ");
            text = Regex.Replace(text, @"[ ]{2,}", " ");
            text = Regex.Replace(text, @"\n{3,}", "\n\n");
            text = Regex.Replace(text, @"(?<=\w)\s+(?=[,.;:!?])", string.Empty);
            return text.Trim();
        }

        private static string EscapeJson(string value)
        {
            if (value == null)
            {
                return string.Empty;
            }

            return value
                .Replace("\\", "\\\\")
                .Replace("\"", "\\\"")
                .Replace("\r", string.Empty)
                .Replace("\n", "\\n");
        }

        private static string ToJson(DocumentData document)
        {
            StringBuilder sb = new StringBuilder();
            sb.Append("{");
            sb.Append("\"source\":\"").Append(EscapeJson(document.Source)).Append("\",");
            sb.Append("\"pageCount\":").Append(document.PageCount).Append(",");
            sb.Append("\"ocrLanguage\":\"").Append(EscapeJson(document.OcrLanguage)).Append("\",");
            sb.Append("\"mergedText\":\"").Append(EscapeJson(document.MergedText)).Append("\",");
            sb.Append("\"pages\":[");

            for (int i = 0; i < document.Pages.Count; i++)
            {
                if (i > 0)
                {
                    sb.Append(",");
                }

                PageData page = document.Pages[i];
                sb.Append("{");
                sb.Append("\"pageNumber\":").Append(page.PageNumber).Append(",");
                sb.Append("\"text\":\"").Append(EscapeJson(page.Text)).Append("\",");
                sb.Append("\"likelyChart\":").Append(page.LikelyChart ? "true" : "false").Append(",");
                sb.Append("\"chartContext\":\"").Append(EscapeJson(page.ChartContext)).Append("\",");
                sb.Append("\"structure\":\"").Append(EscapeJson(page.Structure)).Append("\",");
                AppendStringArray(sb, "keyZones", page.KeyZones);
                sb.Append(",");
                AppendStringArray(sb, "liquidityAreas", page.LiquidityAreas);
                sb.Append(",");
                AppendStringArray(sb, "reactions", page.Reactions);
                sb.Append("}");
            }

            sb.Append("]}");
            return sb.ToString();
        }

        private static void AppendStringArray(StringBuilder sb, string key, List<string> values)
        {
            sb.Append("\"").Append(key).Append("\":[");
            for (int i = 0; i < values.Count; i++)
            {
                if (i > 0)
                {
                    sb.Append(",");
                }

                sb.Append("\"").Append(EscapeJson(values[i])).Append("\"");
            }
            sb.Append("]");
        }
    }
}
