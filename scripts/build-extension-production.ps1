param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern("^https://")]
  [string]$ApiUrl
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$artifactDirectory = Join-Path $root "artifacts"
$unpackedDirectory = Join-Path $artifactDirectory "light-extension"
$zipPath = Join-Path $artifactDirectory "light-extension.zip"
$distDirectory = Join-Path $root "apps\extension\dist"

Push-Location $root
try {
  $env:LIGHT_API_URL = $ApiUrl.TrimEnd("/")
  npm run build:packages
  if ($LASTEXITCODE -ne 0) { throw "Package build failed." }

  npm run build:prod -w @privai/extension
  if ($LASTEXITCODE -ne 0) { throw "Extension build failed." }

  New-Item -ItemType Directory -Force -Path $artifactDirectory | Out-Null
  if (Test-Path $unpackedDirectory) { Remove-Item $unpackedDirectory -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $unpackedDirectory | Out-Null
  Copy-Item -Path (Join-Path $distDirectory "*") -Destination $unpackedDirectory -Recurse -Force

  if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
  Start-Sleep -Milliseconds 500
  Compress-Archive -Path (Join-Path $unpackedDirectory "*") -DestinationPath $zipPath -Force
  Write-Host "Production extension created:"
  Write-Host "  Unpacked: $unpackedDirectory"
  Write-Host "  Zip:      $zipPath"
} finally {
  Remove-Item Env:LIGHT_API_URL -ErrorAction SilentlyContinue
  Pop-Location
}
