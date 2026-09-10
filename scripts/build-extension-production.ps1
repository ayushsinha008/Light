param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern("^https://")]
  [string]$ApiUrl
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$artifactDirectory = Join-Path $root "artifacts"
$zipPath = Join-Path $artifactDirectory "light-extension.zip"

Push-Location $root
try {
  $env:LIGHT_API_URL = $ApiUrl.TrimEnd("/")
  npm run build:packages
  if ($LASTEXITCODE -ne 0) { throw "Package build failed." }

  npm run build:prod -w @privai/extension
  if ($LASTEXITCODE -ne 0) { throw "Extension build failed." }

  New-Item -ItemType Directory -Force -Path $artifactDirectory | Out-Null
  if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
  Compress-Archive -Path (Join-Path $root "apps\extension\dist\*") -DestinationPath $zipPath
  Write-Host "Production extension created: $zipPath"
} finally {
  Remove-Item Env:LIGHT_API_URL -ErrorAction SilentlyContinue
  Pop-Location
}
