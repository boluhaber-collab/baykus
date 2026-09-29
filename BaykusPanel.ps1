# Baykus kontrol paneli — gizli konsollarla API+Web yonetimi (WinForms)
# Çift tık: Baykus.bat / Baykus.vbs (CMD penceresi açmaz)
# UTF-8: script must be saved with BOM so Windows PowerShell 5.1 parses Turkish correctly.
try {
  chcp 65001 > $null
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  [Console]::InputEncoding  = [System.Text.Encoding]::UTF8
  $OutputEncoding = [System.Text.Encoding]::UTF8
} catch { }
$ErrorActionPreference = 'Continue'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
[System.Windows.Forms.Application]::SetCompatibleTextRenderingDefault($false)

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $Root) { $Root = (Get-Location).Path }
Set-Location $Root

$script:ApiProc = $null
$script:WebProc = $null
$script:ApiPid = 0
$script:WebPid = 0

function Test-BaykusPythonExe([string]$Exe) {
  if (-not $Exe) { return $false }
  if (-not (Test-Path -LiteralPath $Exe)) { return $false }
  try {
    # Call operator keeps -c payload as one argv (Start-Process ArgumentList splits on spaces).
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Stop'
    $null = & $Exe -c "import sys; raise SystemExit(0 if sys.version_info[0] >= 3 else 1)" 2>$null
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prev
    return ($code -eq 0)
  } catch { return $false }
}

function Resolve-BaykusSystemPython {
  # Prefer py -3 launcher, then python on PATH. Skip Windows Store stubs that fail.
  $candidates = @()
  $pyCmd = Get-Command py -ErrorAction SilentlyContinue
  if ($pyCmd) {
    try {
      $out = & $pyCmd.Source -3 -c "import sys; print(sys.executable)" 2>$null
      if ($out) { $candidates += ([string]$out).Trim() }
    } catch { }
  }
  foreach ($name in @('python','python3')) {
    $cmd = Get-Command $name -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source) { $candidates += $cmd.Source }
  }
  foreach ($c in ($candidates | Select-Object -Unique)) {
    if (Test-BaykusPythonExe $c) { return $c }
  }
  return $null
}

function Get-BaykusPython {
  # Order: portable runtime -> apps/api .venv -> root .venv/venv -> system py -3 / python
  $paths = @(
    (Join-Path $Root 'runtime\python\python.exe'),
    (Join-Path $Root 'apps\api\.venv\Scripts\python.exe'),
    (Join-Path $Root '.venv\Scripts\python.exe'),
    (Join-Path $Root 'venv\Scripts\python.exe')
  )
  foreach ($p in $paths) {
    if (Test-Path -LiteralPath $p) { return $p }
  }
  return (Resolve-BaykusSystemPython)
}

function Get-BaykusNode {
  # Order: portable runtime\node -> system node on PATH
  $p1 = Join-Path $Root 'runtime\node\node.exe'
  if (Test-Path -LiteralPath $p1) { return $p1 }
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source -and (Test-Path -LiteralPath $cmd.Source)) { return $cmd.Source }
  return $null
}

function Get-BaykusNpm {
  $p1 = Join-Path $Root 'runtime\node\npm.cmd'
  if (Test-Path -LiteralPath $p1) { return $p1 }
  $cmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source) { return $cmd.Source }
  $cmd2 = Get-Command npm -ErrorAction SilentlyContinue
  if ($cmd2 -and $cmd2.Source) { return $cmd2.Source }
  return 'npm.cmd'
}

function Ensure-EnvFiles {
  $envPath = Join-Path $Root '.env'
  if (-not (Test-Path $envPath)) {
    @"
DATABASE_URL=sqlite:///./baykus.db
SECRET_KEY=baykus-isyeri-local-change-me
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
ACCESS_TOKEN_EXPIRE_MINUTES=720
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
"@ | Set-Content -Path $envPath -Encoding UTF8
  }
  # API cwd is apps/api; pydantic Settings(env_file=".env") only sees this file
  $apiEnv = Join-Path $Root 'apps\api\.env'
  $apiEnvBody = @"
DATABASE_URL=sqlite:///./baykus.db
SECRET_KEY=baykus-isyeri-local-change-me
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
ACCESS_TOKEN_EXPIRE_MINUTES=720
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
"@
  if (-not (Test-Path $apiEnv)) {
    $apiEnvBody | Set-Content -Path $apiEnv -Encoding UTF8
  } else {
    $apiContent = Get-Content $apiEnv -Raw -ErrorAction SilentlyContinue
    if ($apiContent -notmatch '(?m)^DATABASE_URL=sqlite') {
      $apiEnvBody | Set-Content -Path $apiEnv -Encoding UTF8
    }
  }
  $webEnv = Join-Path $Root 'apps\web\.env.local'
  if (-not (Test-Path $webEnv)) {
    'NEXT_PUBLIC_API_URL=http://127.0.0.1:8000' | Set-Content -Path $webEnv -Encoding UTF8
  } else {
    $webContent = Get-Content $webEnv -Raw -ErrorAction SilentlyContinue
    if ($webContent -match 'NEXT_PUBLIC_API_URL=http://localhost:8000') {
      'NEXT_PUBLIC_API_URL=http://127.0.0.1:8000' | Set-Content -Path $webEnv -Encoding UTF8
    }
  }
}

function Test-PortUp([int]$Port) {
  try {
    $c = New-Object System.Net.Sockets.TcpClient
    $iar = $c.BeginConnect('127.0.0.1', $Port, $null, $null)
    $ok = $iar.AsyncWaitHandle.WaitOne(400, $false)
    if (-not $ok) { $c.Close(); return $false }
    $c.EndConnect($iar) | Out-Null
    $c.Close()
    return $true
  } catch { return $false }
}

function Get-PidsOnPort([int]$Port) {
  $pids = @()
  try {
    $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    foreach ($c in $conns) {
      if ($c.OwningProcess -and $c.OwningProcess -gt 0) { $pids += [int]$c.OwningProcess }
    }
  } catch { }
  if ($pids.Count -eq 0) {
    try {
      $lines = netstat -ano -p tcp 2>$null | Select-String ":$Port\s+.*LISTENING"
      foreach ($line in $lines) {
        $parts = ($line.ToString() -split '\s+') | Where-Object { $_ -ne '' }
        $pidStr = $parts[-1]
        $n = 0
        if ([int]::TryParse($pidStr, [ref]$n) -and $n -gt 0) { $pids += $n }
      }
    } catch { }
  }
  return ($pids | Select-Object -Unique)
}

function Stop-PortTree([int]$Port) {
  # NOTE: never use $pid / $PID here - $PID is a read-only automatic variable in PowerShell
  $listenPids = @(Get-PidsOnPort $Port)
  foreach ($listenPid in $listenPids) {
    if ($listenPid -le 0) { continue }
    try {
      # children / grandchildren (node workers, uvicorn reloaders)
      $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$listenPid" -ErrorAction SilentlyContinue)
      foreach ($child in $children) {
        $childId = [int]$child.ProcessId
        Get-CimInstance Win32_Process -Filter "ParentProcessId=$childId" -ErrorAction SilentlyContinue |
          ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
        Stop-Process -Id $childId -Force -ErrorAction SilentlyContinue
      }
      # whole tree (covers cmd->npm->node wrappers)
      & taskkill.exe /PID $listenPid /T /F 2>$null | Out-Null
      Stop-Process -Id $listenPid -Force -ErrorAction SilentlyContinue
    } catch { }
  }
}

function Start-HiddenProcess {
  param(
    [string]$FileName,
    [string]$Arguments,
    [string]$WorkingDirectory,
    [hashtable]$EnvExtra
  )
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $FileName
  $psi.Arguments = $Arguments
  $psi.WorkingDirectory = $WorkingDirectory
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
  $psi.RedirectStandardOutput = $false
  $psi.RedirectStandardError = $false
  # Inherit + override env
  $nodeRt = Join-Path $Root 'runtime\node'
  $pyRt = Join-Path $Root 'runtime\python'
  $pyScripts = Join-Path $Root 'runtime\python\Scripts'
  $pathExtra = @()
  if (Test-Path $nodeRt) { $pathExtra += $nodeRt }
  if (Test-Path $pyRt) { $pathExtra += $pyRt }
  if (Test-Path $pyScripts) { $pathExtra += $pyScripts }
  if ($pathExtra.Count -gt 0) {
    $psi.EnvironmentVariables['PATH'] = ($pathExtra -join ';') + ';' + $env:PATH
  }
  if ($EnvExtra) {
    foreach ($k in $EnvExtra.Keys) {
      $psi.EnvironmentVariables[$k] = [string]$EnvExtra[$k]
    }
  }
  $p = New-Object System.Diagnostics.Process
  $p.StartInfo = $psi
  $p.EnableRaisingEvents = $false
  [void]$p.Start()
  return $p
}

function Start-BaykusServices {
  $py = Get-BaykusPython
  if (-not $py) {
    [System.Windows.Forms.MessageBox]::Show(
      "Python bulunamadi.`nSira: runtime\python -> .venv -> sistem (py -3 / python).`nSade pakette once Kurulum; veya Masaustu\baykus kullanin.",
      'Baykus', 'OK', 'Error') | Out-Null
    return
  }
  $nodeCheck = Get-BaykusNode
  if (-not $nodeCheck) {
    [System.Windows.Forms.MessageBox]::Show(
      "Node.js bulunamadi.`nSira: runtime\node -> sistem node.`nTasinabilir zip'i yeniden cikarin veya Node LTS kurun.",
      'Baykus', 'OK', 'Error') | Out-Null
    return
  }
  $nm = Join-Path $Root 'apps\web\node_modules'
  if (-not (Test-Path $nm)) {
    [System.Windows.Forms.MessageBox]::Show(
      "apps\web\node_modules yok.`nSade pakette önce Kurulum; taşınabilirde zip'i yeniden çıkarın.",
      'Baykus', 'OK', 'Error') | Out-Null
    return
  }
  Ensure-EnvFiles

  if (-not (Test-PortUp 8000)) {
    $apiDir = Join-Path $Root 'apps\api'
    $script:ApiProc = Start-HiddenProcess -FileName $py `
      -Arguments '-m uvicorn app.main:app --host 127.0.0.1 --port 8000' `
      -WorkingDirectory $apiDir `
      -EnvExtra @{
        DATABASE_URL = 'sqlite:///./baykus.db'
        CORS_ORIGINS = 'http://localhost:3000,http://127.0.0.1:3000'
        NEXT_PUBLIC_API_URL = 'http://127.0.0.1:8000'
      }
    $script:ApiPid = $script:ApiProc.Id
  }

  Start-Sleep -Seconds 2

  if (-not (Test-PortUp 3000)) {
    $webDir = Join-Path $Root 'apps\web'
    $nodeExe = Get-BaykusNode
    if (-not $nodeExe) { $nodeExe = 'node.exe' }
    $nextJs = Join-Path $webDir 'node_modules\next\dist\bin\next'
    if (-not (Test-Path $nextJs)) {
      # fallback npm.cmd (yine CreateNoWindow)
      $npmCmd = Get-BaykusNpm
      $script:WebProc = Start-HiddenProcess -FileName 'cmd.exe' `
        -Arguments "/c `"$npmCmd`" run dev -- -H 127.0.0.1 -p 3000" `
        -WorkingDirectory $webDir `
        -EnvExtra @{ NEXT_PUBLIC_API_URL = 'http://127.0.0.1:8000' }
    } else {
      $script:WebProc = Start-HiddenProcess -FileName $nodeExe `
        -Arguments "`"$nextJs`" dev -H 127.0.0.1 -p 3000" `
        -WorkingDirectory $webDir `
        -EnvExtra @{ NEXT_PUBLIC_API_URL = 'http://127.0.0.1:8000' }
    }
    $script:WebPid = $script:WebProc.Id
  }
}

function Stop-BaykusServices {
  if ($script:WebProc -and -not $script:WebProc.HasExited) {
    try { Stop-Process -Id $script:WebProc.Id -Force -ErrorAction SilentlyContinue } catch { }
  }
  if ($script:ApiProc -and -not $script:ApiProc.HasExited) {
    try { Stop-Process -Id $script:ApiProc.Id -Force -ErrorAction SilentlyContinue } catch { }
  }
  if ($script:WebPid -gt 0) {
    try { Stop-Process -Id $script:WebPid -Force -ErrorAction SilentlyContinue } catch { }
  }
  if ($script:ApiPid -gt 0) {
    try { Stop-Process -Id $script:ApiPid -Force -ErrorAction SilentlyContinue } catch { }
  }
  Stop-PortTree 3000
  Stop-PortTree 8000
  # next/node child processes often linger
  Start-Sleep -Milliseconds 400
  Stop-PortTree 3000
  Stop-PortTree 8000
  $script:ApiProc = $null
  $script:WebProc = $null
  $script:ApiPid = 0
  $script:WebPid = 0
}

function Open-BaykusBrowser {
  Start-Process 'http://127.0.0.1:3000'
}

function Invoke-BaykusBackup {
  $yedekRoot = Join-Path $Root 'Yedekler'
  if (-not (Test-Path $yedekRoot)) { New-Item -ItemType Directory -Force -Path $yedekRoot | Out-Null }
  $stamp = Get-Date -Format 'yyyyMMdd_HHmm'
  $db = Join-Path $Root 'apps\api\baykus.db'
  if (-not (Test-Path $db)) {
    [System.Windows.Forms.MessageBox]::Show('apps\api\baykus.db bulunamadı.', 'Yedek', 'OK', 'Error') | Out-Null
    return
  }
  $out = Join-Path $yedekRoot "baykus_yedek_$stamp.zip"
  $stage = Join-Path $env:TEMP "baykus_yedek_stage_$stamp"
  if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
  New-Item -ItemType Directory -Force -Path (Join-Path $stage 'apps\api\uploads') | Out-Null
  Copy-Item $db (Join-Path $stage 'apps\api\baykus.db') -Force
  $uploads = Join-Path $Root 'apps\api\uploads'
  if (Test-Path $uploads) {
    Copy-Item (Join-Path $uploads '*') (Join-Path $stage 'apps\api\uploads') -Recurse -Force -ErrorAction SilentlyContinue
  }
  try {
    Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $out -Force
    [System.Windows.Forms.MessageBox]::Show("Yedek yazıldı:`n$out", 'Yedek', 'OK', 'Information') | Out-Null
  } catch {
    [System.Windows.Forms.MessageBox]::Show("Yedek başarısız: $($_.Exception.Message)", 'Yedek', 'OK', 'Error') | Out-Null
  } finally {
    if (Test-Path $stage) { Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue }
  }
}

function Restore-BaykusData([string]$YedekDir) {
  $dbSrc = Join-Path $YedekDir 'apps\api\baykus.db'
  $dbDst = Join-Path $Root 'apps\api\baykus.db'
  if (Test-Path $dbSrc) {
    Copy-Item $dbSrc $dbDst -Force
  }
  $upSrc = Join-Path $YedekDir 'apps\api\uploads'
  $upDst = Join-Path $Root 'apps\api\uploads'
  if (Test-Path $upSrc) {
    if (-not (Test-Path $upDst)) { New-Item -ItemType Directory -Force -Path $upDst | Out-Null }
    Copy-Item (Join-Path $upSrc '*') $upDst -Recurse -Force -ErrorAction SilentlyContinue
  }
}

function Invoke-BaykusUpdate {
  $stamp = Get-Date -Format 'yyyyMMdd_HHmm'
  $yedekDir = Join-Path $Root "Yedekler\once_guncelle_$stamp"
  New-Item -ItemType Directory -Force -Path (Join-Path $yedekDir 'apps\api\uploads') | Out-Null
  $db = Join-Path $Root 'apps\api\baykus.db'
  if (Test-Path $db) {
    Copy-Item $db (Join-Path $yedekDir 'apps\api\baykus.db') -Force
  }
  $uploads = Join-Path $Root 'apps\api\uploads'
  if (Test-Path $uploads) {
    Copy-Item (Join-Path $uploads '*') (Join-Path $yedekDir 'apps\api\uploads') -Recurse -Force -ErrorAction SilentlyContinue
  }

  $gitDir = Join-Path $Root '.git'
  if (Test-Path $gitDir) {
    $git = Get-Command git -ErrorAction SilentlyContinue
    if (-not $git) {
      [System.Windows.Forms.MessageBox]::Show(".git var ama git PATH'te yok. Yedek alındı; DB dokunulmadı.", 'Güncelle', 'OK', 'Error') | Out-Null
      return
    }
    Push-Location $Root
    try {
      git diff --quiet --exit-code 2>$null
      $dirty = ($LASTEXITCODE -ne 0)
      git diff --cached --quiet --exit-code 2>$null
      if ($LASTEXITCODE -ne 0) { $dirty = $true }
      $untracked = git ls-files --others --exclude-standard 2>$null
      if ($untracked) { $dirty = $true }
      if ($dirty) {
        [System.Windows.Forms.MessageBox]::Show("Çalışma alanı kirli; git pull güvenli değil.`nYedek: $yedekDir`nDB dokunulmadı.", 'Güncelle', 'OK', 'Warning') | Out-Null
        return
      }
      git pull --ff-only
      if ($LASTEXITCODE -ne 0) {
        Restore-BaykusData $yedekDir
        [System.Windows.Forms.MessageBox]::Show("git pull başarısız. DB yedekten korundu.`n$yedekDir", 'Güncelle', 'OK', 'Error') | Out-Null
        return
      }
    } finally { Pop-Location }
  } else {
    $dlg = New-Object System.Windows.Forms.FolderBrowserDialog
    $dlg.Description = 'Yeni paket klasörünü seçin (içinde apps\api olmalı). Bu klasörün ÜZERİNE değil, AYRI çıkarılmış zip.'
    $dlg.ShowNewFolderButton = $false
    if ($dlg.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
      [System.Windows.Forms.MessageBox]::Show("İptal. Yedek alındı:`n$yedekDir", 'Güncelle', 'OK', 'Information') | Out-Null
      return
    }
    $src = $dlg.SelectedPath
    if (-not (Test-Path (Join-Path $src 'apps\api'))) {
      $found = Get-ChildItem $src -Directory -ErrorAction SilentlyContinue | Where-Object { Test-Path (Join-Path $_.FullName 'apps\api') } | Select-Object -First 1
      if ($found) { $src = $found.FullName }
    }
    if (-not (Test-Path (Join-Path $src 'apps\api'))) {
      [System.Windows.Forms.MessageBox]::Show('Kaynakta apps\api yok.', 'Güncelle', 'OK', 'Error') | Out-Null
      return
    }
    $srcFull = [System.IO.Path]::GetFullPath($src).TrimEnd('\')
    $rootFull = [System.IO.Path]::GetFullPath($Root).TrimEnd('\')
    if ($srcFull -ieq $rootFull) {
      [System.Windows.Forms.MessageBox]::Show('Kaynak ile hedef aynı klasör olamaz.', 'Güncelle', 'OK', 'Error') | Out-Null
      return
    }
    $xd = @('node_modules', '.venv', 'runtime', 'Yedekler', '.git', 'uploads', '.next', '__pycache__', '.pytest_cache')
    $xf = @('baykus.db', 'baykus.db-journal', '.env', '.env.local')
    $args = @($src, $Root, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/nc', '/ns', '/np', '/XD') + $xd + @('/XF') + $xf
    & robocopy @args | Out-Null
    if ($LASTEXITCODE -ge 8) {
      Restore-BaykusData $yedekDir
      [System.Windows.Forms.MessageBox]::Show("Kod kopyalama başarısız. DB yedekten korundu.`n$yedekDir", 'Güncelle', 'OK', 'Error') | Out-Null
      return
    }
  }

  # deps (best-effort)
  $py = Get-BaykusPython
  $req = Join-Path $Root 'apps\api\requirements.txt'
  if ($py -and (Test-Path $req)) {
    try { & $py -m pip install -r $req --no-warn-script-location 2>&1 | Out-Null } catch { }
  }
  $pkg = Join-Path $Root 'apps\web\package.json'
  if (Test-Path $pkg) {
    $npmCmd = Get-BaykusNpm
    Push-Location (Join-Path $Root 'apps\web')
    try { & cmd.exe /c "`"$npmCmd`" install --no-audit --no-fund" 2>&1 | Out-Null } catch { }
    finally { Pop-Location }
  }

  Restore-BaykusData $yedekDir
  [System.Windows.Forms.MessageBox]::Show(
    "Güncelleme tamam. baykus.db korundu.`nYedek: $yedekDir`nGerekirse Durdur / Başlat yapın.",
    'Güncelle', 'OK', 'Information') | Out-Null
}

function Invoke-BaykusKurulum {
  $bat = Join-Path $Root 'kurulum.bat'
  if (-not (Test-Path $bat)) {
    [System.Windows.Forms.MessageBox]::Show('Bu pakette kurulum.bat yok (taşınabilir paket).', 'Kurulum', 'OK', 'Information') | Out-Null
    return
  }
  Start-Process -FilePath 'cmd.exe' -ArgumentList "/c `"$bat`"" -WorkingDirectory $Root
}

# ---------- UI ----------
$form = New-Object System.Windows.Forms.Form
$form.Text = 'Baykuş Kontrol Paneli'
$form.Size = New-Object System.Drawing.Size(420, 360)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedSingle'
$form.MaximizeBox = $false
$form.MinimizeBox = $true
$form.Font = New-Object System.Drawing.Font('Segoe UI', 10)

$title = New-Object System.Windows.Forms.Label
$title.Text = 'Baykuş Baskı — Kontrol'
$title.Location = New-Object System.Drawing.Point(16, 12)
$title.Size = New-Object System.Drawing.Size(370, 24)
$title.Font = New-Object System.Drawing.Font('Segoe UI', 12, [System.Drawing.FontStyle]::Bold)
$form.Controls.Add($title)

$lblApi = New-Object System.Windows.Forms.Label
$lblApi.Location = New-Object System.Drawing.Point(16, 48)
$lblApi.Size = New-Object System.Drawing.Size(370, 22)
$lblApi.Text = 'API (8000): ...'
$form.Controls.Add($lblApi)

$lblWeb = New-Object System.Windows.Forms.Label
$lblWeb.Location = New-Object System.Drawing.Point(16, 72)
$lblWeb.Size = New-Object System.Drawing.Size(370, 22)
$lblWeb.Text = 'Web (3000): ...'
$form.Controls.Add($lblWeb)

$lblHint = New-Object System.Windows.Forms.Label
$lblHint.Location = New-Object System.Drawing.Point(16, 98)
$lblHint.Size = New-Object System.Drawing.Size(370, 20)
$lblHint.ForeColor = [System.Drawing.Color]::DimGray
$lblHint.Text = 'CMD penceresi açılmaz. Durum her 2 sn yenilenir.'
$form.Controls.Add($lblHint)

function New-Btn([string]$Text, [int]$X, [int]$Y, [int]$W = 180) {
  $b = New-Object System.Windows.Forms.Button
  $b.Text = $Text
  $b.Location = New-Object System.Drawing.Point($X, $Y)
  $b.Size = New-Object System.Drawing.Size($W, 36)
  $form.Controls.Add($b)
  return $b
}

$btnStart = New-Btn 'Başlat' 16 130
$btnStop = New-Btn 'Durdur' 210 130
$btnBrowser = New-Btn 'Tarayıcıyı Aç' 16 176
$btnBackup = New-Btn 'Yedek Al' 210 176
$btnUpdate = New-Btn 'Güncelle' 16 222
$btnKurulum = New-Btn 'Kurulum' 210 222

$hasKurulum = Test-Path (Join-Path $Root 'kurulum.bat')
$btnKurulum.Enabled = $hasKurulum
if (-not $hasKurulum) { $btnKurulum.Text = 'Kurulum (yok)' }

$btnTray = New-Btn 'Tepsiye Küçült' 16 268 374

$tray = New-Object System.Windows.Forms.NotifyIcon
$tray.Text = 'Baykuş'
$tray.Visible = $false
try {
  $tray.Icon = [System.Drawing.SystemIcons]::Application
} catch { }

$trayMenu = New-Object System.Windows.Forms.ContextMenuStrip
$miShow = $trayMenu.Items.Add('Paneli Göster')
$miStart = $trayMenu.Items.Add('Başlat')
$miStop = $trayMenu.Items.Add('Durdur')
$miBrowser = $trayMenu.Items.Add('Tarayıcıyı Aç')
$miExit = $trayMenu.Items.Add('Çıkış')
$tray.ContextMenuStrip = $trayMenu

function Update-StatusLabels {
  if (Test-PortUp 8000) {
    $lblApi.Text = 'API (8000): Çalışıyor'
    $lblApi.ForeColor = [System.Drawing.Color]::DarkGreen
  } else {
    $lblApi.Text = 'API (8000): Kapalı'
    $lblApi.ForeColor = [System.Drawing.Color]::DarkRed
  }
  if (Test-PortUp 3000) {
    $lblWeb.Text = 'Web (3000): Çalışıyor'
    $lblWeb.ForeColor = [System.Drawing.Color]::DarkGreen
  } else {
    $lblWeb.Text = 'Web (3000): Kapalı'
    $lblWeb.ForeColor = [System.Drawing.Color]::DarkRed
  }
}

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 2000
$timer.Add_Tick({ Update-StatusLabels })
$timer.Start()
Update-StatusLabels

$btnStart.Add_Click({
  $btnStart.Enabled = $false
  try { Start-BaykusServices } finally { $btnStart.Enabled = $true; Update-StatusLabels }
})
$btnStop.Add_Click({
  $btnStop.Enabled = $false
  try { Stop-BaykusServices } finally { $btnStop.Enabled = $true; Update-StatusLabels }
})
$btnBrowser.Add_Click({ Open-BaykusBrowser })
$btnBackup.Add_Click({
  $btnBackup.Enabled = $false
  try { Invoke-BaykusBackup } finally { $btnBackup.Enabled = $true }
})
$btnUpdate.Add_Click({
  $r = [System.Windows.Forms.MessageBox]::Show(
    'Güncellemeden önce yedek alınacak; baykus.db ASLA ezilmez. Devam?',
    'Güncelle', 'YesNo', 'Question')
  if ($r -ne [System.Windows.Forms.DialogResult]::Yes) { return }
  $btnUpdate.Enabled = $false
  try { Invoke-BaykusUpdate } finally { $btnUpdate.Enabled = $true }
})
$btnKurulum.Add_Click({ Invoke-BaykusKurulum })

function Show-FromTray {
  $form.Show()
  $form.WindowState = 'Normal'
  $form.ShowInTaskbar = $true
  $tray.Visible = $false
  $form.Activate()
}

$btnTray.Add_Click({
  $tray.Visible = $true
  $form.ShowInTaskbar = $false
  $form.Hide()
})
$tray.Add_DoubleClick({ Show-FromTray })
$miShow.Add_Click({ Show-FromTray })
$miStart.Add_Click({ Start-BaykusServices; Update-StatusLabels })
$miStop.Add_Click({ Stop-BaykusServices; Update-StatusLabels })
$miBrowser.Add_Click({ Open-BaykusBrowser })
$miExit.Add_Click({
  $tray.Visible = $false
  $form.Close()
})

$form.Add_FormClosing({
  param($sender, $e)
  # Panel kapaninca servisleri DURDURMA — arka planda kalsin
  $timer.Stop()
  $tray.Visible = $false
  $tray.Dispose()
})

[void][System.Windows.Forms.Application]::Run($form)

