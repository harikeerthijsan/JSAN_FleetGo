<#
  FleetGo — local PostgreSQL helper (no Docker).

  Manages a dedicated PostgreSQL cluster created from the installed
  PostgreSQL 18 binaries, isolated from any existing instance:

    - Data dir : %USERPROFILE%\fleetgo-local-pg\data
    - Port     : 5433
    - Superuser: fleetgo  /  password: fleetgo_dev_pwd
    - Database : fleetgo

  Matches DATABASE_URL in backend/.env:
    postgresql://fleetgo:fleetgo_dev_pwd@localhost:5434/fleetgo?schema=public

  Usage (from the project root):
    pwsh ./scripts/local-db.ps1 start     # start the cluster
    pwsh ./scripts/local-db.ps1 stop      # stop the cluster
    pwsh ./scripts/local-db.ps1 status    # show status
    pwsh ./scripts/local-db.ps1 init      # one-time: create the cluster + db
#>
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('start', 'stop', 'status', 'init')]
  [string]$Action
)

$ErrorActionPreference = 'Stop'
$PgBin = 'C:\Program Files\PostgreSQL\18\bin'
$Base = Join-Path $env:USERPROFILE 'fleetgo-local-pg'
$Data = Join-Path $Base 'data'
$Log = Join-Path $Base 'server.log'
$Port = 5433
$env:PGPASSWORD = 'fleetgo_dev_pwd'

switch ($Action) {
  'init' {
    if (Test-Path $Data) { Write-Host "Cluster already exists at $Data"; break }
    New-Item -ItemType Directory -Force -Path $Base | Out-Null
    $pw = Join-Path $Base 'pw.txt'
    Set-Content -Path $pw -Value 'fleetgo_dev_pwd' -NoNewline -Encoding ascii
    & "$PgBin\initdb.exe" -D $Data -U fleetgo -A scram-sha-256 --pwfile=$pw -E UTF8
    Remove-Item $pw -Force
    & "$PgBin\pg_ctl.exe" -D $Data -l $Log -o "-p $Port -c listen_addresses=localhost" start
    Start-Sleep -Seconds 2
    & "$PgBin\createdb.exe" -U fleetgo -h localhost -p $Port fleetgo
    Write-Host "Initialized cluster and created 'fleetgo' database on port $Port"
  }
  'start' {
    & "$PgBin\pg_ctl.exe" -D $Data -l $Log -o "-p $Port -c listen_addresses=localhost" start
  }
  'stop' {
    & "$PgBin\pg_ctl.exe" -D $Data stop -m fast
  }
  'status' {
    & "$PgBin\pg_ctl.exe" -D $Data status
  }
}
