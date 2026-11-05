$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $projectDirectory
try {
  docker compose --profile demo up -d --build --wait backend demo-tunnel
  if ($LASTEXITCODE -ne 0) { throw 'Could not start the backend and demo tunnel.' }
  $demoAddress = $null
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    $tunnelLog = docker compose logs --no-color --tail 100 demo-tunnel 2>&1 | Out-String
    $addresses = [regex]::Matches($tunnelLog, 'https://[a-z0-9-]+\.trycloudflare\.com')
    if ($addresses.Count -gt 0) { $demoAddress = $addresses[$addresses.Count - 1].Value; break }
    Start-Sleep -Seconds 2
  }
  if (!$demoAddress) { throw 'The tunnel has not returned an address. Check docker compose logs demo-tunnel.' }
  Write-Host "Demo backend: $demoAddress"
  Write-Host 'Keep Docker and this laptop running during the demo. A tunnel restart may change this address.'
  Write-Host "Deploy the admin from backend/admin-web with: npx vercel --prod --build-env VITE_API_BASE_URL=$demoAddress"
  node scripts/local-backend.cjs
} finally { Pop-Location }
