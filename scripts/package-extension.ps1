param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^https://')]
  [string]$ApiBaseUrl
)

$ErrorActionPreference = 'Stop'
$ApiBaseUrl = $ApiBaseUrl.TrimEnd('/')
$apiUri = [Uri]$ApiBaseUrl
$apiOrigin = $apiUri.GetLeftPart([System.UriPartial]::Authority)
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$source = Join-Path $repositoryRoot 'Extension\outlook-template-vault'
$release = Join-Path $repositoryRoot 'release'
$stage = Join-Path $env:TEMP ('mtv-extension-' + [guid]::NewGuid().ToString('N'))
$destination = Join-Path $release 'mail-template-vault-extension-v1.2.0.zip'
New-Item -ItemType Directory -Force -Path $stage, $release | Out-Null
try {
  $excluded = @('node_modules', 'tests', 'scripts', 'src', 'package.json', 'package-lock.json', 'README.md')
  Get-ChildItem -LiteralPath $source -Force | Where-Object { $excluded -notcontains $_.Name } | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $stage -Recurse -Force
  }
  $configPath = Join-Path $stage 'supabase-config.js'
  $config = Get-Content -LiteralPath $configPath -Raw
  $config = $config.Replace('http://localhost:3000', $ApiBaseUrl)
  Set-Content -LiteralPath $configPath -Value $config -Encoding utf8

  $manifestPath = Join-Path $stage 'manifest.json'
  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  $manifest.host_permissions = @('https://outlook.office.com/*', 'https://outlook.office365.com/*', "$apiOrigin/*")
  $manifest.content_security_policy.extension_pages = "script-src 'self'; object-src 'self'; connect-src $apiOrigin"
  $manifest | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $manifestPath -Encoding utf8

  if (Test-Path -LiteralPath $destination) { Remove-Item -LiteralPath $destination -Force }
  Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $destination -CompressionLevel Optimal
  Write-Output $destination
} finally {
  if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
}
