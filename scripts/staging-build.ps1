param([Parameter(Mandatory=$true)][string]$StayCheckout)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
  node scripts/check-hosted-staging.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Staging target preflight failed' }
  $env:VITE_API_URL = $env:STAGING_OWNER_BACKEND_ORIGIN
  npm run build
  if ($LASTEXITCODE -ne 0) { throw 'Owner staging build failed' }
  $stay = Resolve-Path -LiteralPath $StayCheckout
  node --check (Join-Path $stay 'server.js')
  if ($LASTEXITCODE -ne 0) { throw 'Stay server syntax validation failed' }
} finally {
  Pop-Location
}
