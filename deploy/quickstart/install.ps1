#Requires -Version 5.1
<#
    morechat.co — one-command deployment for Windows (PowerShell 5.1+).

        .\install.ps1            # generate .env secrets -> build -> up -> wait healthy
        .\install.ps1 -Action status
        .\install.ps1 -Action down    # keeps volumes (never uses -v)

    Idempotent: re-running only fills secrets that are still missing or placeholders.
    Messages are ASCII on purpose: Windows PowerShell 5.1 reads a BOM-less script
    as ANSI, so non-ASCII text here would be mangled. The .env file this script
    writes is UTF-8 WITHOUT BOM (UTF8Encoding($false)).
#>
param(
    [ValidateSet('install', 'status', 'down', 'help')]
    [string]$Action = 'install'
)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$EnvFile = Join-Path $PSScriptRoot '.env'
$ExampleFile = Join-Path $PSScriptRoot '.env.example'
$ComposeFile = 'docker-compose.yml'

function Write-Step {
    param([string]$Message)
    Write-Host ''
    Write-Host "==> $Message"
}

function Fail {
    param([string]$Message)
    Write-Host "ERROR: $Message" -ForegroundColor Red
    exit 1
}

function Get-EnvValue {
    param([string]$Path, [string]$Key)
    $pattern = '^' + [regex]::Escape($Key) + '=(.*)$'
    foreach ($line in [System.IO.File]::ReadAllLines($Path)) {
        if ($line -match $pattern) { return $matches[1] }
    }
    return ''
}

function Set-EnvValue {
    param([string]$Path, [string]$Key, [string]$Value)
    $pattern = '^' + [regex]::Escape($Key) + '='
    $found = $false
    $out = New-Object System.Collections.Generic.List[string]
    foreach ($line in [System.IO.File]::ReadAllLines($Path)) {
        if ($line -match $pattern) {
            $out.Add("$Key=$Value")
            $found = $true
        }
        else {
            $out.Add($line)
        }
    }
    if (-not $found) { $out.Add("$Key=$Value") }
    $text = ($out.ToArray() -join "`n") + "`n"
    # UTF8Encoding($false) => no BOM. Compose/dotenv parsing stays clean and the
    # comment text in .env.example survives round-tripping.
    [System.IO.File]::WriteAllText($Path, $text, (New-Object System.Text.UTF8Encoding($false)))
}

function Test-Placeholder {
    param([string]$Value)
    if ([string]::IsNullOrWhiteSpace($Value)) { return $true }
    # Anywhere in the value, not just at the start: DATABASE_URL embeds the
    # placeholder password in the middle of the URL.
    return $Value -match 'REPLACE_WITH|REPLACE_ME|change-me|CHANGEME'
}

function New-RandomBytes {
    param([int]$ByteCount)
    $bytes = New-Object byte[] $ByteCount
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return , $bytes
}

function New-HexSecret {
    param([int]$ByteCount = 32)
    $bytes = New-RandomBytes -ByteCount $ByteCount
    return -join ($bytes | ForEach-Object { $_.ToString('x2') })
}

function New-Base64Secret {
    param([int]$ByteCount = 32)
    $bytes = New-RandomBytes -ByteCount $ByteCount
    return [Convert]::ToBase64String($bytes)
}

function Invoke-Compose {
    param([string[]]$ComposeArgs, [switch]$AllowFailure)
    & docker compose -f $ComposeFile @ComposeArgs
    $code = $LASTEXITCODE
    if ($code -ne 0 -and -not $AllowFailure) {
        Fail ("docker compose {0} failed (exit {1})" -f ($ComposeArgs -join ' '), $code)
    }
    return $code
}

function Wait-ServiceHealthy {
    param([string]$Service, [int]$TimeoutSeconds = 600)
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $status = 'unknown'
    while ((Get-Date) -lt $deadline) {
        $cid = (& docker compose -f $ComposeFile ps -q $Service) 2>$null
        if ($LASTEXITCODE -eq 0 -and $cid) {
            $status = (& docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' $cid) 2>$null
            if ($status -eq 'healthy') {
                Write-Host "  $Service : healthy"
                return $true
            }
            if ($status -eq 'exited' -or $status -eq 'dead') {
                Write-Host "  $Service : $status - last log lines:" -ForegroundColor Yellow
                & docker compose -f $ComposeFile logs --tail 40 $Service
                return $false
            }
        }
        Start-Sleep -Seconds 5
    }
    Write-Host "  $Service : not ready after ${TimeoutSeconds}s (last status: $status)" -ForegroundColor Yellow
    return $false
}

# --------------------------------------------------------------- action switch
if ($Action -eq 'help') {
    Write-Host 'Usage: .\install.ps1 [-Action install|status|down|help]'
    exit 0
}
if ($Action -eq 'status') {
    Invoke-Compose -ComposeArgs @('ps') | Out-Null
    exit 0
}
if ($Action -eq 'down') {
    Write-Host 'Stopping services (volumes are kept)...'
    Invoke-Compose -ComposeArgs @('down') | Out-Null
    exit 0
}

# --------------------------------------------------------------- preflight
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Fail 'docker not found. Install Docker Desktop (or Docker Engine in WSL) first.'
}
& docker compose version *> $null
if ($LASTEXITCODE -ne 0) {
    Fail 'docker compose (v2 plugin) not found. Update Docker Desktop / install the compose plugin.'
}

# --------------------------------------------------------------- .env
if (-not (Test-Path -LiteralPath $EnvFile)) {
    if (-not (Test-Path -LiteralPath $ExampleFile)) { Fail ".env.example is missing; cannot create .env" }
    Copy-Item -LiteralPath $ExampleFile -Destination $EnvFile
    Write-Host "Created .env from .env.example"
}

$changed = $false

if (Test-Placeholder (Get-EnvValue -Path $EnvFile -Key 'POSTGRES_PASSWORD')) {
    Set-EnvValue -Path $EnvFile -Key 'POSTGRES_PASSWORD' -Value (New-HexSecret -ByteCount 16)
    Write-Host 'Generated POSTGRES_PASSWORD'
    $changed = $true
}

$dbUser = Get-EnvValue -Path $EnvFile -Key 'POSTGRES_USER'
$dbName = Get-EnvValue -Path $EnvFile -Key 'POSTGRES_DB'
$dbPass = Get-EnvValue -Path $EnvFile -Key 'POSTGRES_PASSWORD'
if ([string]::IsNullOrWhiteSpace($dbUser)) { Fail 'POSTGRES_USER is empty in .env' }
if ([string]::IsNullOrWhiteSpace($dbName)) { Fail 'POSTGRES_DB is empty in .env' }

# DATABASE_URL must match POSTGRES_* exactly (a mismatched password makes the
# api fail to connect). Rebuild it whenever the current password is not in it,
# which also self-heals a hand-edited password.
$dbUrl = Get-EnvValue -Path $EnvFile -Key 'DATABASE_URL'
if ([string]::IsNullOrWhiteSpace($dbUrl) -or -not $dbUrl.Contains(":$dbPass@")) {
    $newUrl = "postgres://${dbUser}:${dbPass}@postgres:5432/${dbName}?sslmode=disable"
    Set-EnvValue -Path $EnvFile -Key 'DATABASE_URL' -Value $newUrl
    Write-Host 'Filled DATABASE_URL from POSTGRES_* values'
    $changed = $true
}

if (Test-Placeholder (Get-EnvValue -Path $EnvFile -Key 'JWT_SECRET')) {
    Set-EnvValue -Path $EnvFile -Key 'JWT_SECRET' -Value (New-HexSecret -ByteCount 32)
    Write-Host 'Generated JWT_SECRET (32 random bytes, hex)'
    $changed = $true
}

# MULTICA_VCS_SECRET_KEY must be base64 of exactly 32 bytes (secretbox.LoadKey),
# so it uses base64 here - a hex string would decode to 48 bytes and be rejected.
if (Test-Placeholder (Get-EnvValue -Path $EnvFile -Key 'MULTICA_VCS_SECRET_KEY')) {
    Set-EnvValue -Path $EnvFile -Key 'MULTICA_VCS_SECRET_KEY' -Value (New-Base64Secret -ByteCount 32)
    Write-Host 'Generated MULTICA_VCS_SECRET_KEY (32 random bytes, base64)'
    $changed = $true
}

if ([string]::IsNullOrWhiteSpace((Get-EnvValue -Path $EnvFile -Key 'FRONTEND_ORIGIN')) -or
    [string]::IsNullOrWhiteSpace((Get-EnvValue -Path $EnvFile -Key 'MULTICA_APP_URL'))) {
    Fail 'FRONTEND_ORIGIN / MULTICA_APP_URL must not be empty in .env'
}

if ($changed) {
    Write-Host 'Secrets are ready. Keep .env out of git.'
    Write-Host 'Note: if you later change POSTGRES_PASSWORD by hand, update DATABASE_URL too.'
}

# --------------------------------------------------------------- build and up
Write-Step 'Pulling base images'
Invoke-Compose -ComposeArgs @('pull', 'postgres') -AllowFailure | Out-Null

Write-Step 'Building api / web images (first run is slow)'
Invoke-Compose -ComposeArgs @('build') | Out-Null

Write-Step 'Starting services'
Invoke-Compose -ComposeArgs @('up', '-d') | Out-Null

Write-Step 'Waiting for readiness (the first install runs the full migration set)'
$ok = $true
if (-not (Wait-ServiceHealthy -Service 'postgres' -TimeoutSeconds 120)) { $ok = $false }
if (-not (Wait-ServiceHealthy -Service 'api' -TimeoutSeconds 600)) { $ok = $false }
if (-not (Wait-ServiceHealthy -Service 'web' -TimeoutSeconds 180)) { $ok = $false }

$appUrl = Get-EnvValue -Path $EnvFile -Key 'MULTICA_APP_URL'
$apiPort = Get-EnvValue -Path $EnvFile -Key 'PORT'
$webPort = Get-EnvValue -Path $EnvFile -Key 'WEB_PORT'
if ([string]::IsNullOrWhiteSpace($webPort)) { $webPort = '3000' }

Write-Host ''
if ($ok) { Write-Host 'Deployment complete.' } else { Write-Host 'Deployment is not fully ready yet - check: docker compose ps / logs -f api' -ForegroundColor Yellow }
Write-Host ''
Write-Host "  App URL    : $appUrl"
Write-Host "  Frontend   : http://localhost:$webPort"
Write-Host "  API        : http://localhost:$apiPort  (/health, /readyz)"
Write-Host ''
Write-Host 'First login: open the URL above, enter an email. Without a mail backend the'
Write-Host 'verification code is printed in the API log:'
Write-Host '  docker compose -f docker-compose.yml logs -f api | Select-String "Verification code"'
Write-Host ''
Write-Host 'Next steps:'
Write-Host '  1) Real email: set RESEND_API_KEY or SMTP_* in .env, then'
Write-Host '     docker compose -f docker-compose.yml up -d --force-recreate api'
Write-Host '  2) Domain + HTTPS: see README.md (Caddyfile.example is ready)'
Write-Host '  3) Stop: .\install.ps1 -Action down     Status: .\install.ps1 -Action status'
Write-Host '  4) Never run "docker compose down -v" - it deletes the pgdata volume.'
