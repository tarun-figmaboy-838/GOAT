<#
  Fence the Farm - reset the lab

  /game is the game: you edit it, and Vercel deploys it. There is no build and
  no publish step.

  /lab is a duplicate to experiment in. This script throws your experiments away
  and copies /game over the top, so run it only when you want a clean slate.

    .\scripts\reset-lab.ps1           reset /lab from /game
    .\scripts\reset-lab.ps1 -WhatIf   say what would happen, change nothing
#>
[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$src = Join-Path $root 'game'
$dst = Join-Path $root 'lab'

if (-not (Test-Path (Join-Path $src 'index.html'))) { throw "no game found at: $src" }

if (-not $PSCmdlet.ShouldProcess($dst, 'DISCARD its contents and copy /game over it')) { return }

if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
New-Item -ItemType Directory -Force -Path $dst | Out-Null

Get-ChildItem $src -Recurse -File | ForEach-Object {
  if ($_.Name -like '__*') { return }                 # never copy a test harness
  $rel = $_.FullName.Substring($src.Length).TrimStart('\')
  $target = Join-Path $dst $rel
  $dir = Split-Path $target -Parent
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  Copy-Item $_.FullName $target -Force
}

# Give the lab its own browser-tab title so the two can never be confused.
$idx = Join-Path $dst 'index.html'
$html = [System.IO.File]::ReadAllText($idx, [System.Text.Encoding]::UTF8)
# Build the em-dash from its code point rather than typing it: PowerShell 5.1
# reads a BOM-less UTF-8 script as ANSI, which would mangle it on the way out.
$dash = [char]0x2014
$html = $html.Replace('<title>Fence the Farm</title>', "<title>Fence the Farm $dash LAB</title>")
[System.IO.File]::WriteAllText($idx, $html, (New-Object System.Text.UTF8Encoding($false)))

$files = Get-ChildItem $dst -Recurse -File
$mb = [math]::Round((($files | Measure-Object Length -Sum).Sum / 1MB), 1)
"/lab reset from /game : $($files.Count) files, $mb MB"
