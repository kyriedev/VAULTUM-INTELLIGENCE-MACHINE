# PDF OCR Pipeline

Vaultum now has a Windows-native OCR path for image-heavy research PDFs.

## What it does

- Detects when embedded PDF text is too weak to trust.
- Switches image-heavy or slide-style PDFs to OCR.
- Builds structured knowledge JSON plus merged text output.
- Preserves chart-aware hints such as structure, zones, liquidity, and reactions when OCR can recover them.

## Main entrypoint

Run the PowerShell wrapper from the repo root:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\research\extract-pdf-knowledge.ps1 -InputPath "<path-to-your-document-folder>" -OutputDir ".\tmp\macro-trends-knowledge"
```

## Outputs

For each PDF the pipeline writes:

- `<document>.knowledge.json`
- `<document>.merged.txt`
- `knowledge-summary.json`
- `knowledge-summary.md`

## Notes

- The wrapper compiles `pdf-ocr-helper.cs` automatically into `tmp\research\pdf-ocr-helper.exe`.
- Sidecar OCR JSON is cached in the sidecar directory so repeat runs do not need to OCR unchanged files again.
- Known image-heavy files such as the market-structure slide decks and Babypips are forced straight to OCR.
- OCR recovery is still partial on some dense chart books and large handbooks, so deeper page-by-page re-runs may still be useful for the highest-fidelity doctrine updates.
