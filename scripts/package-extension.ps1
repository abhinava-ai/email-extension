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
$portalDownloads = Join-Path $repositoryRoot 'App\mail-template-vault\public\downloads'
$stage = Join-Path $env:TEMP ('mtv-extension-' + [guid]::NewGuid().ToString('N'))
$version = (Get-Content -LiteralPath (Join-Path $source 'manifest.json') -Raw | ConvertFrom-Json).version
$destination = Join-Path $release "mail-template-vault-extension-v$version.zip"
$utf8 = New-Object System.Text.UTF8Encoding($false)
New-Item -ItemType Directory -Force -Path $stage, $release, $portalDownloads | Out-Null
try {
  $excluded = @('.git', '.gitignore', 'node_modules', 'test-results', 'tests', 'scripts', 'src', 'package.json', 'package-lock.json', 'README.md')
  Get-ChildItem -LiteralPath $source -Force | Where-Object { $excluded -notcontains $_.Name } | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $stage -Recurse -Force
  }
  $configPath = Join-Path $stage 'supabase-config.js'
  $config = [IO.File]::ReadAllText($configPath).Replace('http://localhost:3000', $ApiBaseUrl)
  [IO.File]::WriteAllText($configPath, $config, $utf8)

  $manifestPath = Join-Path $stage 'manifest.json'
  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  # Every Outlook address the content scripts run on keeps its host permission.
  $outlookHosts = @($manifest.content_scripts[0].matches)
  $manifest.host_permissions = @($outlookHosts + "$apiOrigin/*")
  $manifest.content_security_policy.extension_pages = "script-src 'self'; object-src 'self'; connect-src $apiOrigin"
  [IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 20), $utf8)

  if (Test-Path -LiteralPath $destination) { Remove-Item -LiteralPath $destination -Force }
  Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $destination -CompressionLevel Optimal
  # The Install page offers this copy to signed-in users.
  Copy-Item -LiteralPath $destination -Destination (Join-Path $portalDownloads 'mail-template-vault-extension.zip') -Force
  Write-Output $destination
} finally {
  if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
}
