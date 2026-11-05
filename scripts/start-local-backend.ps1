$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $projectDirectory
try {
  docker compose up -d --build --wait backend
  if ($LASTEXITCODE -ne 0) { throw 'Docker could not start the backend. Open Docker Desktop and check the project .env.' }
  node scripts/local-backend.cjs
  if ($LASTEXITCODE -ne 0) { throw 'The backend connection check did not pass.' }
} finally {
  Pop-Location
}
