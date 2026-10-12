# Baykuş — format sonrası kurulum. KUR.bat çift tıklanınca çalışır.
# Python + Node kontrol eder, .venv ve node_modules kurar, masaüstü kısayolu açar, programı başlatır.
# UTF-8 BOM ile kaydedilmelidir.
$ErrorActionPreference = 'Continue'
try { chcp 65001 > $null; [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
Add-Type -AssemblyName System.Windows.Forms
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root
$ApiDir = Join-Path $Root 'apps\api'
$WebDir = Join-Path $Root 'apps\web'

function Say([string]$m) { Write-Host "[Baykuş] $m" -ForegroundColor Cyan }
function Fail([string]$m) {
  Write-Host "[Baykuş] $m" -ForegroundColor Red
  [System.Windows.Forms.MessageBox]::Show($m, 'Baykuş Kurulum', 'OK', 'Error') | Out-Null
  exit 1
}
function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}
function Find-Python {
  foreach ($c in @(@('py', '-3'), @('python'))) {
    $exe = $c[0]; $a = @($c | Select-Object -Skip 1)
    if (Get-Command $exe -ErrorAction SilentlyContinue) {
      $v = & $exe @a -c "import sys;print(sys.version_info[0]*100+sys.version_info[1])" 2>$null
      if ($LASTEXITCODE -eq 0 -and [int]$v -ge 310) { return ,$c }
    }
  }
  return $null
}
$HasWinget = [bool](Get-Command winget -ErrorAction SilentlyContinue)

Say 'Python kontrol ediliyor...'
$venvPy = Join-Path $ApiDir '.venv\Scripts\python.exe'
$py = Find-Python
if (-not $py -and -not (Test-Path $venvPy)) {
  if ($HasWinget) {
    Say 'Python bulunamadı, winget ile kuruluyor (birkaç dakika sürebilir)...'
    winget install -e --id Python.Python.3.12 --accept-source-agreements --accept-package-agreements --scope user
    Refresh-Path
    $py = Find-Python
  }
  if (-not $py) {
    Fail "Python bulunamadı.`n`nLütfen https://www.python.org/downloads/ adresinden Python 3.12 indirin, kurulumda 'Add python.exe to PATH' kutusunu işaretleyin, sonra KUR.bat'ı tekrar çalıştırın."
  }
}

Say 'Node.js kontrol ediliyor...'
if (-not (Get-Command node -ErrorAction SilentlyContinue) -and -not (Test-Path (Join-Path $Root 'runtime\node\node.exe'))) {
  if ($HasWinget) {
    Say 'Node.js bulunamadı, winget ile kuruluyor...'
    winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    Refresh-Path
  }
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Fail "Node.js bulunamadı.`n`nLütfen https://nodejs.org/ adresinden LTS sürümünü indirip kurun, sonra KUR.bat'ı tekrar çalıştırın."
  }
}

if (-not (Test-Path $venvPy)) {
  Say 'Python sanal ortamı (.venv) oluşturuluyor...'
  $exe = $py[0]; $a = @($py | Select-Object -Skip 1)
  & $exe @a -m venv (Join-Path $ApiDir '.venv')
  if (-not (Test-Path $venvPy)) { Fail '.venv oluşturulamadı.' }
}
Say 'API bağımlılıkları kuruluyor (pip)...'
& $venvPy -m pip install --upgrade pip -q
& $venvPy -m pip install -r (Join-Path $ApiDir 'requirements.txt')
if ($LASTEXITCODE -ne 0) { Fail "pip install başarısız. İnternet bağlantısını kontrol edip KUR.bat'ı tekrar çalıştırın." }

if (-not (Test-Path (Join-Path $WebDir 'node_modules\next'))) {
  Say 'Web bağımlılıkları kuruluyor (npm install)...'
  Push-Location $WebDir
  $npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
  if (-not $npm) { $npm = Join-Path $Root 'runtime\node\npm.cmd' }
  & $npm install
  $code = $LASTEXITCODE
  Pop-Location
  if ($code -ne 0) { Fail "npm install başarısız. İnternet bağlantısını kontrol edip KUR.bat'ı tekrar çalıştırın." }
}

# .env dosyaları yedekte yoksa örnekten oluştur
$apiEnv = Join-Path $ApiDir '.env'
if (-not (Test-Path $apiEnv) -and (Test-Path (Join-Path $ApiDir '.env.example'))) {
  Copy-Item (Join-Path $ApiDir '.env.example') $apiEnv
}

Say 'Masaüstü kısayolu oluşturuluyor...'
try {
  $desk = [Environment]::GetFolderPath('Desktop')
  $sh = New-Object -ComObject WScript.Shell
  $lnk = $sh.CreateShortcut((Join-Path $desk 'Baykuş Panel.lnk'))
  $lnk.TargetPath = Join-Path $Root 'Baykus.vbs'
  $lnk.WorkingDirectory = $Root
  $lnk.Save()
} catch { Say "Kısayol oluşturulamadı: $($_.Exception.Message)" }

$db = Join-Path $ApiDir 'baykus.db'
if (Test-Path $db) { Say "Veritabanı bulundu: $db ($([math]::Round((Get-Item $db).Length/1MB,1)) MB)" }
else { Say 'UYARI: apps\api\baykus.db yok — boş veritabanıyla açılacak.' }

Say 'Program başlatılıyor...'
$env:BAYKUS_AUTOSTART = '1'
Start-Process -FilePath 'wscript.exe' -ArgumentList "//nologo `"$(Join-Path $Root 'Baykus.vbs')`"" -WorkingDirectory $Root
Start-Sleep -Seconds 2
[System.Windows.Forms.MessageBox]::Show("Kurulum tamamlandı.`n`nProgram başlatıldı; tarayıcıda http://127.0.0.1:3000 birkaç saniye içinde açılır.`nMasaüstüne 'Baykuş Panel' kısayolu eklendi.", 'Baykuş Kurulum', 'OK', 'Information') | Out-Null
exit 0
