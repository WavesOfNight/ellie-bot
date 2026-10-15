# =============================================================================
# Ellie [BOT] — crée l'archive à envoyer sur le serveur Plesk (depuis Windows).
# Usage (PowerShell, à la racine du projet) :   powershell -ExecutionPolicy Bypass -File deploy\pack.ps1
# Résultat : ellie-bot.tar.gz (sans node_modules, builds, base de données ni fichiers .env).
# =============================================================================
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$archive = Join-Path $root "ellie-bot.tar.gz"
if (Test-Path $archive) { Remove-Item $archive -Force }

tar -czf $archive `
  --exclude=node_modules --exclude=.next --exclude=dist --exclude=data --exclude=backups `
  --exclude=.env --exclude=.env.local --exclude=*.tsbuildinfo --exclude=.git --exclude=.claude `
  --exclude=ellie-bot.tar.gz --exclude=PROMPT-NOUVEAU-BOT.md `
  .

$size = [math]::Round((Get-Item $archive).Length / 1MB, 2)
Write-Host "Archive prête : $archive ($size Mo)" -ForegroundColor Green
Write-Host "Envoie-la sur le serveur, par exemple :  scp ellie-bot.tar.gz root@TON_SERVEUR:/root/"
