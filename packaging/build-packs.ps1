# Baykus workplace packs builder (Windows). Run from anywhere.
# Creates Desktop\Baykus_Tasinabilir_YYYYMMDD and Desktop\Baykus_Kurulum_Sade_YYYYMMDD
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Stamp = Get-Date -Format 'yyyyMMdd'
$Desktop = [Environment]::GetFolderPath('Desktop')
$Work = Join-Path $env:TEMP "baykus-pack-build-$Stamp"
$NodeVer = 'v20.20.2'
$PyVer = '3.12.10'
$NodeZipUrl = "https://nodejs.org/dist/$NodeVer/node-$NodeVer-win-x64.zip"
$PyZipUrl = "https://www.python.org/ftp/python/$PyVer/python-$PyVer-embed-amd64.zip"
$GetPipUrl = 'https://bootstrap.pypa.io/get-pip.py'
$SrcRepo = 'C:\Users\engin\Desktop\baykus'
$LiveDb = 'C:\Users\engin\Desktop\baykus\apps\api\baykus.db'
$LiveUploads = 'C:\Users\engin\Desktop\baykus\apps\api\uploads'
$BoxLogo = Join-Path $Work 'extra-uploads'

function Write-Utf8Bom([string]$Path, [string]$Text) {
  $enc = New-Object System.Text.UTF8Encoding $true
  [System.IO.File]::WriteAllText($Path, $Text.TrimStart("`r","`n") + "`r`n", $enc)
}

function Copy-SourceTree([string]$From, [string]$To) {
  New-Item -ItemType Directory -Force -Path $To | Out-Null
  $excludeDir = @('.git','tmp','backups','.venv','node_modules','.next','__pycache__','.pytest_cache','Yedekler','runtime','.turbo')
  $excludeFile = @('.env','.env.local','tsconfig.tsbuildinfo','baykus.db','baykus.db-journal')
  robocopy $From $To /E /NFL /NDL /NJH /NJS /nc /ns /np `
    /XD $excludeDir `
    /XF $excludeFile *.zip *.db | Out-Null
  $rc = $LASTEXITCODE
  if ($rc -ge 8) { throw "robocopy source failed code $rc" }
}

function Copy-LiveData([string]$Root) {
  $api = Join-Path $Root 'apps\api'
  New-Item -ItemType Directory -Force -Path (Join-Path $api 'uploads\designs') | Out-Null
  New-Item -ItemType Directory -Force -Path (Join-Path $api 'uploads\documents') | Out-Null
  New-Item -ItemType Directory -Force -Path (Join-Path $api 'uploads\logos') | Out-Null
  Copy-Item $LiveDb (Join-Path $api 'baykus.db') -Force
  if (Test-Path $LiveUploads) {
    robocopy $LiveUploads (Join-Path $api 'uploads') /E /NFL /NDL /NJH /NJS /nc /ns /np /XF .gitkeep | Out-Null
  }
  if (Test-Path $BoxLogo) {
    robocopy $BoxLogo (Join-Path $api 'uploads') /E /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
  }
}

function Write-EnvFiles([string]$Root) {
  $envTxt = @"
# Isyeri PC - SQLite (Alembic kullanmayin)
DATABASE_URL=sqlite:///./baykus.db
SECRET_KEY=baykus-isyeri-local-change-me
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
ACCESS_TOKEN_EXPIRE_MINUTES=720
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
"@
  Write-Utf8Bom (Join-Path $Root '.env') $envTxt
  New-Item -ItemType Directory -Force -Path (Join-Path $Root 'apps\web') | Out-Null
  Write-Utf8Bom (Join-Path $Root 'apps\web\.env.local') "NEXT_PUBLIC_API_URL=http://127.0.0.1:8000"
}

function Get-GitInfo([string]$Repo) {
  Push-Location $Repo
  try {
    $sha = (git rev-parse HEAD).Trim()
    $short = (git rev-parse --short HEAD).Trim()
    $subj = (git log -1 --format=%s).Trim()
  } finally { Pop-Location }
  return @{ Sha = $sha; Short = $short; Subject = $subj }
}

Write-Host "Work dir: $Work"
if (Test-Path $Work) { Remove-Item $Work -Recurse -Force }
New-Item -ItemType Directory -Force -Path $Work | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $Work 'dl') | Out-Null

$git = Get-GitInfo $SrcRepo
Write-Host "Git $($git.Short) $($git.Subject)"

Write-Host "Downloading Node $NodeVer ..."
$nodeZip = Join-Path $Work "dl\node-$NodeVer-win-x64.zip"
curl.exe -L --fail -o $nodeZip $NodeZipUrl
Write-Host "Downloading Python $PyVer embed ..."
$pyZip = Join-Path $Work "dl\python-$PyVer-embed-amd64.zip"
curl.exe -L --fail -o $pyZip $PyZipUrl
Write-Host "Downloading get-pip.py ..."
$getPip = Join-Path $Work 'dl\get-pip.py'
curl.exe -L --fail -o $getPip $GetPipUrl

# --- extract runtimes once ---
$rtNode = Join-Path $Work 'runtime\node'
$rtPy = Join-Path $Work 'runtime\python'
New-Item -ItemType Directory -Force -Path $rtNode | Out-Null
New-Item -ItemType Directory -Force -Path $rtPy | Out-Null
Expand-Archive -Path $nodeZip -DestinationPath (Join-Path $Work 'dl\node-ex') -Force
$nodeInner = Get-ChildItem (Join-Path $Work 'dl\node-ex') -Directory | Select-Object -First 1
Copy-Item (Join-Path $nodeInner.FullName '*') $rtNode -Recurse -Force
Expand-Archive -Path $pyZip -DestinationPath $rtPy -Force
Copy-Item $getPip (Join-Path $rtPy 'get-pip.py') -Force

$pth = Get-ChildItem $rtPy -Filter '*.pth' | Select-Object -First 1
if (-not $pth) { throw 'python ._pth not found' }
$pthText = @"
python312.zip
.
Lib\site-packages
import site
"@
[System.IO.File]::WriteAllText($pth.FullName, $pthText)

Write-Host "Installing pip + API requirements into portable Python..."
& (Join-Path $rtPy 'python.exe') (Join-Path $rtPy 'get-pip.py') --no-warn-script-location
if ($LASTEXITCODE -ne 0) { throw "get-pip failed $LASTEXITCODE" }
& (Join-Path $rtPy 'python.exe') -m pip install --no-warn-script-location -r (Join-Path $SrcRepo 'apps\api\requirements.txt')
if ($LASTEXITCODE -ne 0) { throw "pip install failed $LASTEXITCODE" }

# npm install using portable node into a staging web dir
Write-Host "npm install (portable node)..."
$webStage = Join-Path $Work 'web-stage'
New-Item -ItemType Directory -Force -Path $webStage | Out-Null
Copy-Item (Join-Path $SrcRepo 'apps\web\package.json') $webStage
Copy-Item (Join-Path $SrcRepo 'apps\web\package-lock.json') $webStage -ErrorAction SilentlyContinue
$env:PATH = "$rtNode;" + $env:PATH
Push-Location $webStage
try {
  & (Join-Path $rtNode 'npm.cmd') install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw "npm install failed $LASTEXITCODE" }
} finally { Pop-Location }

# extra uploads (logo) if present next to script extras
$extra = 'C:\Users\engin\Desktop\_baykus_extra_uploads'
if (Test-Path $extra) { $script:BoxLogo = $extra; $BoxLogo = $extra }

function New-PackInfo([string]$Kind) {
  $db = Get-Item $LiveDb
  return @"
Baykus $Kind paketi
====================
Paket tarihi (TR): $(Get-Date -Format 'yyyy-MM-dd HH:mm')
Git SHA: $($git.Sha)
Git kisa: $($git.Short)
Son commit: $($git.Subject)
Kaynak: guncelleme PC Desktop\baykus (main)

DB dosya boyutu: $($db.Length) bayt
DB LastWriteTime: $($db.LastWriteTime.ToString('yyyy-MM-dd HH:mm'))
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000

Korunan (guncellemede ASLA ezilmez):
- apps\api\baykus.db
- apps\api\uploads
- .env / apps\web\.env.local
- runtime (tasinabilir), .venv / node_modules
"@
}

# ========== A: Tasinabilir ==========
$AName = "Baykus_Tasinabilir_$Stamp"
$ARoot = Join-Path $Work $AName
Write-Host "Assembling $AName ..."
Copy-SourceTree $SrcRepo $ARoot
Copy-LiveData $ARoot
Write-EnvFiles $ARoot
New-Item -ItemType Directory -Force -Path (Join-Path $ARoot 'runtime') | Out-Null
robocopy (Join-Path $Work 'runtime') (Join-Path $ARoot 'runtime') /E /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
if (Test-Path (Join-Path $ARoot 'apps\web\node_modules')) { Remove-Item (Join-Path $ARoot 'apps\web\node_modules') -Recurse -Force }
robocopy (Join-Path $webStage 'node_modules') (Join-Path $ARoot 'apps\web\node_modules') /E /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
Copy-Item (Join-Path $webStage 'package-lock.json') (Join-Path $ARoot 'apps\web\package-lock.json') -Force -ErrorAction SilentlyContinue

# no kurulum for A
Remove-Item (Join-Path $ARoot 'kurulum.bat') -ErrorAction SilentlyContinue
Remove-Item (Join-Path $ARoot 'KURULUM.txt') -ErrorAction SilentlyContinue
Remove-Item (Join-Path $ARoot 'Python_Kurulumu.txt') -ErrorAction SilentlyContinue
Remove-Item (Join-Path $ARoot 'Phyton Kurulumu.txt') -ErrorAction SilentlyContinue
# OKU
$okuA = Join-Path $SrcRepo 'packaging\tasinabilir\OKU.txt'
if (Test-Path $okuA) { Copy-Item $okuA (Join-Path $ARoot 'OKU.txt') -Force }
else { throw 'missing packaging/tasinabilir/OKU.txt - pull latest' }
Write-Utf8Bom (Join-Path $ARoot 'PACK_INFO.txt') (New-PackInfo 'Tasinabilir (gomulu Python+Node)')
New-Item -ItemType Directory -Force -Path (Join-Path $ARoot 'Yedekler') | Out-Null

# ========== B: Kurulum_Sade ==========
$BName = "Baykus_Kurulum_Sade_$Stamp"
$BRoot = Join-Path $Work $BName
Write-Host "Assembling $BName ..."
Copy-SourceTree $SrcRepo $BRoot
Copy-LiveData $BRoot
Write-EnvFiles $BRoot
Remove-Item (Join-Path $BRoot 'Phyton Kurulumu.txt') -ErrorAction SilentlyContinue
$okuB = Join-Path $SrcRepo 'packaging\sade\OKU.txt'
if (Test-Path $okuB) { Copy-Item $okuB (Join-Path $BRoot 'OKU.txt') -Force }
Write-Utf8Bom (Join-Path $BRoot 'PACK_INFO.txt') (New-PackInfo 'Kurulum Sade (sistem Python+Node)')
New-Item -ItemType Directory -Force -Path (Join-Path $BRoot 'Yedekler') | Out-Null
# sade: no runtime, no node_modules (kurulum.bat installs)

# Deliver to Desktop
Write-Host "Copying folders to Desktop..."
foreach ($name in @($AName, $BName)) {
  $dest = Join-Path $Desktop $name
  if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
  robocopy (Join-Path $Work $name) $dest /E /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "copy to desktop $name failed $LASTEXITCODE" }
  $zip = Join-Path $Desktop "$name.zip"
  if (Test-Path $zip) { Remove-Item $zip -Force }
  Write-Host "Zipping $name (tar) ..."
  Push-Location $Desktop
  try {
    & tar.exe -a -c -f $zip $name
    if ($LASTEXITCODE -ne 0) { throw "tar zip failed $LASTEXITCODE for $name" }
  } finally { Pop-Location }
}

Write-Host "DONE"
Get-ChildItem $Desktop -Filter "Baykus_*_$Stamp*" | Format-Table Name, Length, LastWriteTime
