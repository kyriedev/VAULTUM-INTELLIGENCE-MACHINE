param(
  [Parameter(Mandatory = $true)]
  [string]$InputPath,

  [Parameter(Mandatory = $true)]
  [string]$OutputDir,

  [int]$MaxOcrPages = 0,

  [string]$SidecarDir = ""
)

$ErrorActionPreference = 'Stop'

function Resolve-FirstExistingPath {
  param(
    [string[]]$Candidates,
    [string]$Label
  )

  foreach ($candidate in $Candidates) {
    if ([System.IO.File]::Exists($candidate)) {
      return $candidate
    }
  }

  throw "Unable to locate $Label."
}

function Ensure-OcrHelper {
  param(
    [string]$RepoRoot
  )

  $sourcePath = Join-Path $RepoRoot 'scripts\research\pdf-ocr-helper.cs'
  $binaryDir = Join-Path $RepoRoot 'tmp\research'
  $binaryPath = Join-Path $binaryDir 'pdf-ocr-helper.exe'
  New-Item -ItemType Directory -Force -Path $binaryDir | Out-Null

  if ((Test-Path $binaryPath) -and ((Get-Item $binaryPath).LastWriteTimeUtc -ge (Get-Item $sourcePath).LastWriteTimeUtc)) {
    return $binaryPath
  }

  $cscPath = Resolve-FirstExistingPath -Candidates @(
    'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe',
    'C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe'
  ) -Label 'C# compiler'
  $windowsWinmd = Resolve-FirstExistingPath -Candidates @(
    'C:\Program Files (x86)\Windows Kits\10\UnionMetadata\10.0.26100.0\Windows.winmd',
    'C:\Program Files (x86)\Windows Kits\10\UnionMetadata\10.0.22621.0\Windows.winmd',
    'C:\Program Files (x86)\Windows Kits\10\UnionMetadata\10.0.22000.0\Windows.winmd'
  ) -Label 'Windows.winmd'
  $systemRuntime = Resolve-FirstExistingPath -Candidates @(
    'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\System.Runtime.dll',
    'C:\Windows\Microsoft.NET\Framework\v4.0.30319\System.Runtime.dll'
  ) -Label 'System.Runtime.dll'
  $systemRuntimeWinRt = Resolve-FirstExistingPath -Candidates @(
    'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\System.Runtime.WindowsRuntime.dll',
    'C:\Windows\Microsoft.NET\Framework\v4.0.30319\System.Runtime.WindowsRuntime.dll'
  ) -Label 'System.Runtime.WindowsRuntime.dll'

  & $cscPath /nologo /target:exe "/out:$binaryPath" "/reference:$systemRuntime" "/reference:$systemRuntimeWinRt" "/reference:$windowsWinmd" $sourcePath
  return $binaryPath
}

function Get-PdfFiles {
  param(
    [string]$ResolvedInputPath
  )

  if (Test-Path -LiteralPath $ResolvedInputPath -PathType Container) {
    return Get-ChildItem -LiteralPath $ResolvedInputPath -File | Where-Object { $_.Extension -ieq '.pdf' } | Sort-Object Name
  }

  return @(Get-Item -LiteralPath $ResolvedInputPath)
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$resolvedInputPath = (Resolve-Path -LiteralPath $InputPath).Path
$resolvedOutputDir = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $OutputDir))
if ([string]::IsNullOrWhiteSpace($SidecarDir)) {
  $resolvedSidecarDir = Join-Path $repoRoot 'tmp\research\ocr-sidecars'
} else {
  $resolvedSidecarDir = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $SidecarDir))
}

New-Item -ItemType Directory -Force -Path $resolvedOutputDir | Out-Null
New-Item -ItemType Directory -Force -Path $resolvedSidecarDir | Out-Null

$ocrHelperPath = Ensure-OcrHelper -RepoRoot $repoRoot
$pdfFiles = Get-PdfFiles -ResolvedInputPath $resolvedInputPath
$inspectScriptPath = Join-Path $repoRoot 'scripts\research\inspect-pdf-text.mjs'

foreach ($pdfFile in $pdfFiles) {
  $forceOcrByName = $pdfFile.Name -match '(?i)market structure|setups|babypips|guidelines'
  if (-not $forceOcrByName) {
    $inspectionRaw = & node $inspectScriptPath $pdfFile.FullName
    $inspection = $inspectionRaw | ConvertFrom-Json
    $needsOcr = ($inspection.classification -ne 'text-based') -or ($inspection.score -lt 0.74) -or ($inspection.characterCount -lt 600)
    if (-not $needsOcr) {
      continue
    }
  }

  $sidecarPath = Join-Path $resolvedSidecarDir ($pdfFile.Name + '.ocr.json')
  $needsRefresh = -not (Test-Path $sidecarPath) -or ((Get-Item $sidecarPath).LastWriteTimeUtc -lt $pdfFile.LastWriteTimeUtc) -or ((Get-Item $sidecarPath).LastWriteTimeUtc -lt (Get-Item $ocrHelperPath).LastWriteTimeUtc)
  if (-not $needsRefresh) {
    continue
  }

  if ($MaxOcrPages -gt 0) {
    $json = & $ocrHelperPath $pdfFile.FullName $MaxOcrPages
  } else {
    $json = & $ocrHelperPath $pdfFile.FullName
  }

  if ([string]::IsNullOrWhiteSpace($json) -or (-not $json.TrimStart().StartsWith('{'))) {
    throw "OCR helper did not return valid JSON for $($pdfFile.FullName)."
  }

  [System.IO.File]::WriteAllText($sidecarPath, $json, [System.Text.Encoding]::UTF8)
}

$env:VAULTUM_OCR_SIDECAR_DIR = $resolvedSidecarDir
$env:VAULTUM_FORCE_OCR_PATTERNS = 'market structure|setups|babypips|guidelines'
Push-Location $repoRoot
try {
  & node 'scripts/research/extract-pdf-knowledge.mjs' $resolvedInputPath $resolvedOutputDir $MaxOcrPages
} finally {
  Pop-Location
}
