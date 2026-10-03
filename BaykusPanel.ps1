# Baykus kontrol paneli — gizli konsollarla API+Web yonetimi (WinForms)
# Çift tık: Baykus.bat / Baykus.vbs (CMD penceresi açmaz)
# Yeni Sürüm Oluştur: Masaüstü\Baykus_Guncelleme.zip (baykus.db ve uploads yok)
# Güncelle: zip'i yedek alıp uygular; işyeri verisini geri yazar.
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

function Test-RealBaykusRuntime([string]$RuntimeRoot) {
  if (-not $RuntimeRoot) { return $false }
  $py = Join-Path $RuntimeRoot 'python\python.exe'
  $node = Join-Path $RuntimeRoot 'node\node.exe'
  return ((Test-Path -LiteralPath $py) -or (Test-Path -LiteralPath $node))
}

function Get-BaykusDesktopPath {
  $desktop = [Environment]::GetFolderPath('Desktop')
  if ($desktop -and (Test-Path -LiteralPath $desktop)) { return $desktop }
  $fallback = Join-Path $env:USERPROFILE 'Desktop'
  if (Test-Path -LiteralPath $fallback) { return $fallback }
  return $desktop
}

function Find-BaykusUpdatePackage {
  # Adaylar: kurulum klasoru, Masaustu, USB kok. Birden fazla zip varsa en yenisi.
  $desktop = Get-BaykusDesktopPath
  $zipName = 'Baykus_Guncelleme.zip'
  $dirName = 'Baykus_Guncelleme'
  $zips = New-Object System.Collections.Generic.List[string]
  $dirs = New-Object System.Collections.Generic.List[string]
  [void]$zips.Add((Join-Path $Root $zipName))
  [void]$dirs.Add((Join-Path $Root $dirName))
  if ($desktop) {
    [void]$zips.Add((Join-Path $desktop $zipName))
    [void]$dirs.Add((Join-Path $desktop $dirName))
  }
  try {
    foreach ($drive in [System.IO.DriveInfo]::GetDrives()) {
      if (-not $drive.IsReady) { continue }
      if ($drive.DriveType -ne [System.IO.DriveType]::Removable) { continue }
      [void]$zips.Add((Join-Path $drive.Name $zipName))
      [void]$dirs.Add((Join-Path $drive.Name $dirName))
    }
  } catch { }
  $bestZip = $null
  $bestTime = [datetime]::MinValue
  foreach ($z in $zips) {
    if (-not $z) { continue }
    if (-not (Test-Path -LiteralPath $z -PathType Leaf)) { continue }
    $wt = (Get-Item -LiteralPath $z).LastWriteTime
    if ($wt -ge $bestTime) { $bestTime = $wt; $bestZip = $z }
  }
  if ($bestZip) { return [pscustomobject]@{ Kind = 'zip'; Path = $bestZip } }
  $bestDir = $null
  $bestDirTime = [datetime]::MinValue
  foreach ($d in $dirs) {
    if (-not $d) { continue }
    $marker = Join-Path $d 'BAYKUS_GUNCELLEME.marker'
    if (-not (Test-Path -LiteralPath $marker)) { continue }
    $wt = (Get-Item -LiteralPath $marker).LastWriteTime
    if ($wt -ge $bestDirTime) { $bestDirTime = $wt; $bestDir = $d }
  }
  if ($bestDir) { return [pscustomobject]@{ Kind = 'dir'; Path = $bestDir } }
  return $null
}

function Resolve-BaykusUpdateRoot([string]$Extracted) {
  $marker = Join-Path $Extracted 'BAYKUS_GUNCELLEME.marker'
  if (Test-Path -LiteralPath $marker) { return $Extracted }
  if (Test-Path -LiteralPath (Join-Path $Extracted 'apps\api')) { return $Extracted }
  $subs = @(Get-ChildItem -LiteralPath $Extracted -Directory -ErrorAction SilentlyContinue)
  foreach ($s in $subs) {
    if (Test-Path -LiteralPath (Join-Path $s.FullName 'BAYKUS_GUNCELLEME.marker')) { return $s.FullName }
    if (Test-Path -LiteralPath (Join-Path $s.FullName 'apps\api')) { return $s.FullName }
  }
  return $null
}

function Expand-BaykusUpdateZip([string]$ZipPath, [string]$Dest) {
  New-Item -ItemType Directory -Force -Path $Dest | Out-Null
  $tar = Join-Path $env:SystemRoot 'System32\tar.exe'
  if (Test-Path -LiteralPath $tar) {
    & $tar -xf $ZipPath -C $Dest
    if ($LASTEXITCODE -eq 0) { return }
  }
  Expand-Archive -LiteralPath $ZipPath -DestinationPath $Dest -Force
}

function Copy-BaykusUpdateTree([string]$Src, [string]$Dst) {
  # Kod + (varsa) tasinabilir runtime + node_modules. Veri ve isyeri ayari HARIC.
  $xd = @('uploads', 'Yedekler', '.git', '__pycache__', '.pytest_cache', '.ruff_cache', 'backups', '.venv', 'venv')
  $srcRuntime = Join-Path $Src 'runtime'
  if (-not (Test-RealBaykusRuntime $srcRuntime)) { $xd += 'runtime' }
  $xf = @('baykus.db', 'baykus.db-journal', '.env', '.env.local', 'Baykus_Guncelleme.zip')
  $roboArgs = @($Src, $Dst, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/nc', '/ns', '/np', '/XD') + $xd + @('/XF') + $xf
  & robocopy @roboArgs | Out-Null
  return [int]$LASTEXITCODE
}

function Clear-BaykusGenerated {
  $next = Join-Path $Root 'apps\web\.next'
  if (Test-Path -LiteralPath $next) {
    Remove-Item -LiteralPath $next -Recurse -Force -ErrorAction SilentlyContinue
  }
  $api = Join-Path $Root 'apps\api'
  if (Test-Path -LiteralPath $api) {
    Get-ChildItem -LiteralPath $api -Recurse -Directory -Filter '__pycache__' -ErrorAction SilentlyContinue |
      ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue }
  }
}

function Invoke-BaykusGitUpdate([string]$YedekDir) {
  $git = Get-Command git -ErrorAction SilentlyContinue
  if (-not $git) {
    Start-BaykusServices
    [System.Windows.Forms.MessageBox]::Show(".git var ama git PATH'te yok. Yedek alındı; veritabanına dokunulmadı.", 'Güncelle', 'OK', 'Error') | Out-Null
    return
  }
  Push-Location $Root
  try {
    git diff --quiet --exit-code 2>$null
    $dirty = ($LASTEXITCODE -ne 0)
    git diff --cached --quiet --exit-code 2>$null
    if ($LASTEXITCODE -ne 0) { $dirty = $true }
    if ($dirty) {
      Start-BaykusServices
      [System.Windows.Forms.MessageBox]::Show("Çalışma alanı kirli; git pull güvenli değil.`nYedek: $YedekDir`nVeritabanına dokunulmadı.", 'Güncelle', 'OK', 'Warning') | Out-Null
      return
    }
    git pull --ff-only origin main
    if ($LASTEXITCODE -ne 0) {
      Restore-BaykusData $YedekDir
      Start-BaykusServices
      [System.Windows.Forms.MessageBox]::Show("git pull başarısız. Veritabanı yedekten korundu.`n$YedekDir", 'Güncelle', 'OK', 'Error') | Out-Null
      return
    }
  } finally { Pop-Location }
  Clear-BaykusGenerated
  Restore-BaykusData $YedekDir
  Start-BaykusServices
  [System.Windows.Forms.MessageBox]::Show(
    "Güncelleme tamam (git). baykus.db ve uploads korundu.`nYedek: $YedekDir`nServisler yeniden başlatıldı.",
    'Güncelle', 'OK', 'Information') | Out-Null
}

function Invoke-BaykusUpdate {
  $pkg = Find-BaykusUpdatePackage
  if (-not $pkg) {
    $dlg = New-Object System.Windows.Forms.OpenFileDialog
    $dlg.Title = 'Baykus_Guncelleme.zip seçin (masaüstü, USB veya bu klasör)'
    $dlg.Filter = 'Güncelleme paketi (*.zip)|*.zip|Tüm dosyalar (*.*)|*.*'
    $dlg.FileName = 'Baykus_Guncelleme.zip'
    $desktop = Get-BaykusDesktopPath
    if ($desktop) { $dlg.InitialDirectory = $desktop }
    if ($dlg.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK -and $dlg.FileName) {
      $pkg = @{ Kind = 'zip'; Path = $dlg.FileName }
    }
  }
  if (-not $pkg) {
    $gitDir = Join-Path $Root '.git'
    if (Test-Path -LiteralPath $gitDir) {
      $useGit = [System.Windows.Forms.MessageBox]::Show(
        "Baykus_Guncelleme.zip bulunamadı.`n`nGit ile güncellensin mi (git pull)?`nbaykus.db ve uploads korunur.",
        'Güncelle', 'YesNo', 'Question')
      if ($useGit -ne [System.Windows.Forms.DialogResult]::Yes) { return }
      $stampGit = Get-Date -Format 'yyyyMMdd_HHmm'
      $yedekGit = Join-Path $Root "Yedekler\once_guncelle_$stampGit"
      New-Item -ItemType Directory -Force -Path (Join-Path $yedekGit 'apps\api\uploads') | Out-Null
      Stop-BaykusServices
      $dbGit = Join-Path $Root 'apps\api\baykus.db'
      if (Test-Path -LiteralPath $dbGit) {
        try { Copy-Item -LiteralPath $dbGit -Destination (Join-Path $yedekGit 'apps\api\baykus.db') -Force -ErrorAction Stop }
        catch {
          Start-BaykusServices
          [System.Windows.Forms.MessageBox]::Show("Yedek alınamadı. Güncelleme iptal.`n$($_.Exception.Message)", 'Güncelle', 'OK', 'Error') | Out-Null
          return
        }
      }
      $upGit = Join-Path $Root 'apps\api\uploads'
      if (Test-Path -LiteralPath $upGit) {
        Copy-Item (Join-Path $upGit '*') (Join-Path $yedekGit 'apps\api\uploads') -Recurse -Force -ErrorAction SilentlyContinue
      }
      Invoke-BaykusGitUpdate $yedekGit
      return
    }
    [System.Windows.Forms.MessageBox]::Show(
      "Güncelleme paketi bulunamadı.`n`nBaykus_Guncelleme.zip dosyasını masaüstüne, USB'ye veya bu klasöre koyup tekrar deneyin.`nHiçbir dosya değişmedi.",
      'Güncelle', 'OK', 'Information') | Out-Null
    return
  }

  $pkgPath = [string]$pkg.Path
  $ask = [System.Windows.Forms.MessageBox]::Show(
    "Paket bulundu:`n$pkgPath`n`nÖnce yedek alınacak.`nKod ve runtime güncellenecek.`nbaykus.db ve uploads ASLA ezilmez.`nServisler durup yeniden başlayacak.`n`nDevam edilsin mi?",
    'Güncelle', 'YesNo', 'Question')
  if ($ask -ne [System.Windows.Forms.DialogResult]::Yes) { return }

  $form.Cursor = [System.Windows.Forms.Cursors]::WaitCursor
  $lblHint.Text = 'Servisler durduruluyor, yedek alınıyor...'
  [System.Windows.Forms.Application]::DoEvents()

  $stamp = Get-Date -Format 'yyyyMMdd_HHmm'
  $yedekDir = Join-Path $Root "Yedekler\once_guncelle_$stamp"
  $extract = $null
  try {
    New-Item -ItemType Directory -Force -Path (Join-Path $yedekDir 'apps\api\uploads') | Out-Null
    Stop-BaykusServices
    Start-Sleep -Milliseconds 600

    $db = Join-Path $Root 'apps\api\baykus.db'
    if (Test-Path -LiteralPath $db) {
      try {
        Copy-Item -LiteralPath $db -Destination (Join-Path $yedekDir 'apps\api\baykus.db') -Force -ErrorAction Stop
      } catch {
        Start-BaykusServices
        [System.Windows.Forms.MessageBox]::Show(
          "baykus.db yedeklenemedi. Güncelleme İPTAL.`nVeritabanına dokunulmadı.`n$($_.Exception.Message)",
          'Güncelle', 'OK', 'Error') | Out-Null
        return
      }
    }
    $uploads = Join-Path $Root 'apps\api\uploads'
    if (Test-Path -LiteralPath $uploads) {
      Copy-Item (Join-Path $uploads '*') (Join-Path $yedekDir 'apps\api\uploads') -Recurse -Force -ErrorAction SilentlyContinue
    }

    $lblHint.Text = 'Güncelleme paketi uygulanıyor...'
    [System.Windows.Forms.Application]::DoEvents()

    $src = $null
    if ([string]$pkg.Kind -eq 'zip') {
      $extract = Join-Path $env:TEMP ("baykus_guncelle_zip_" + $stamp)
      if (Test-Path -LiteralPath $extract) { Remove-Item -LiteralPath $extract -Recurse -Force -ErrorAction SilentlyContinue }
      try {
        Expand-BaykusUpdateZip $pkgPath $extract
      } catch {
        Start-BaykusServices
        [System.Windows.Forms.MessageBox]::Show("Zip açılamadı.`n$($_.Exception.Message)`nVeritabanına dokunulmadı.", 'Güncelle', 'OK', 'Error') | Out-Null
        return
      }
      $src = Resolve-BaykusUpdateRoot $extract
    } else {
      $src = $pkgPath
    }
    if (-not $src -or -not (Test-Path -LiteralPath (Join-Path $src 'apps\api'))) {
      Start-BaykusServices
      [System.Windows.Forms.MessageBox]::Show('Pakette apps\api yok. Güncelleme iptal. Veritabanına dokunulmadı.', 'Güncelle', 'OK', 'Error') | Out-Null
      return
    }
    $markerPath = Join-Path $src 'BAYKUS_GUNCELLEME.marker'
    if (-not (Test-Path -LiteralPath $markerPath)) {
      $warn = [System.Windows.Forms.MessageBox]::Show(
        "Bu pakette BAYKUS_GUNCELLEME işareti yok.`nYine de uygulansın mı?`n`nbaykus.db ve uploads yine de korunur.",
        'Güncelle', 'YesNo', 'Warning')
      if ($warn -ne [System.Windows.Forms.DialogResult]::Yes) {
        Start-BaykusServices
        [System.Windows.Forms.MessageBox]::Show("İptal. Yedek duruyor:`n$yedekDir", 'Güncelle', 'OK', 'Information') | Out-Null
        return
      }
    }
    $srcFull = [System.IO.Path]::GetFullPath($src).TrimEnd('\')
    $rootFull = [System.IO.Path]::GetFullPath($Root).TrimEnd('\')
    if ($srcFull -ieq $rootFull) {
      Start-BaykusServices
      [System.Windows.Forms.MessageBox]::Show('Kaynak ile kurulum aynı klasör olamaz.', 'Güncelle', 'OK', 'Error') | Out-Null
      return
    }

    $rc = Copy-BaykusUpdateTree $src $Root
    if ($rc -ge 8) {
      Restore-BaykusData $yedekDir
      Start-BaykusServices
      [System.Windows.Forms.MessageBox]::Show("Kod kopyalanamadı (robocopy $rc). Veritabanı yedekten korundu.`n$yedekDir", 'Güncelle', 'OK', 'Error') | Out-Null
      return
    }
    $lblHint.Text = 'Python paketleri kontrol ediliyor...'
    [System.Windows.Forms.Application]::DoEvents()
    $pyNow = Get-BaykusPython
    $reqNow = Join-Path $Root 'apps\api\requirements.txt'
    if ($pyNow -and (Test-Path -LiteralPath $reqNow)) {
      try { & $pyNow -m pip install -r $reqNow --disable-pip-version-check --timeout 60 --no-warn-script-location 2>&1 | Out-Null } catch { }
    }
    Clear-BaykusGenerated
    Restore-BaykusData $yedekDir
    Start-BaykusServices
    [System.Windows.Forms.MessageBox]::Show(
      "Güncelleme tamam.`nbaykus.db ve uploads korundu (yedekten geri yazıldı).`nYedek: $yedekDir`nServisler yeniden başlatıldı.`n`nYeni düğmeler için paneli kapatıp Baykus.bat ile bir kez yeniden açın.",
      'Güncelle', 'OK', 'Information') | Out-Null
  } finally {
    if ($extract -and (Test-Path -LiteralPath $extract)) {
      Remove-Item -LiteralPath $extract -Recurse -Force -ErrorAction SilentlyContinue
    }
    $form.Cursor = [System.Windows.Forms.Cursors]::Default
    $lblHint.Text = 'CMD penceresi açılmaz. Durum her 2 sn yenilenir.'
  }
}

function Invoke-BaykusNewRelease {
  $ask = [System.Windows.Forms.MessageBox]::Show(
    "Masaüstüne Baykus_Guncelleme.zip hazırlanacak.`n`nPakette güncel kod ve (varsa) taşınabilir runtime olur.`nİşyeri baykus.db ve uploads PAKETE GİRMEZ.`n`nDevam edilsin mi?",
    'Yeni Sürüm', 'YesNo', 'Question')
  if ($ask -ne [System.Windows.Forms.DialogResult]::Yes) { return }

  $form.Cursor = [System.Windows.Forms.Cursors]::WaitCursor
  $lblHint.Text = 'Son kod kontrol ediliyor...'
  [System.Windows.Forms.Application]::DoEvents()

  $sha = ''
  $subject = ''
  $gitDir = Join-Path $Root '.git'
  if (Test-Path -LiteralPath $gitDir) {
    $git = Get-Command git -ErrorAction SilentlyContinue
    if (-not $git) {
      $form.Cursor = [System.Windows.Forms.Cursors]::Default
      [System.Windows.Forms.MessageBox]::Show('git bulunamadı. Paket oluşturulmadı.', 'Yeni Sürüm', 'OK', 'Error') | Out-Null
      return
    }
    Push-Location $Root
    try {
      $branch = (git rev-parse --abbrev-ref HEAD 2>$null | Out-String).Trim()
      git diff --quiet --exit-code 2>$null
      $dirty = ($LASTEXITCODE -ne 0)
      git diff --cached --quiet --exit-code 2>$null
      if ($LASTEXITCODE -ne 0) { $dirty = $true }
      if ($dirty -or ($branch -and $branch -ne 'main')) {
        $form.Cursor = [System.Windows.Forms.Cursors]::Default
        $why = 'Kaydedilmemiş kod değişikliği var.'
        if ($branch -and $branch -ne 'main') { $why = "Dal main değil ($branch)." }
        $go = [System.Windows.Forms.MessageBox]::Show(
          "$why`nYine de bu klasördeki dosyalarla paket oluşturulsun mu?`n(git pull yapılmayacak)",
          'Yeni Sürüm', 'YesNo', 'Warning')
        if ($go -ne [System.Windows.Forms.DialogResult]::Yes) { return }
        $form.Cursor = [System.Windows.Forms.Cursors]::WaitCursor
      } else {
        $lblHint.Text = 'main dalından son kod alınıyor...'
        [System.Windows.Forms.Application]::DoEvents()
        $pullOut = git pull --ff-only origin main 2>&1 | Out-String
        if ($LASTEXITCODE -ne 0) {
          $form.Cursor = [System.Windows.Forms.Cursors]::Default
          $go = [System.Windows.Forms.MessageBox]::Show(
            "Son kod alınamadı.`n$pullOut`n`nMevcut dosyalarla paket oluşturulsun mu?",
            'Yeni Sürüm', 'YesNo', 'Warning')
          if ($go -ne [System.Windows.Forms.DialogResult]::Yes) { return }
          $form.Cursor = [System.Windows.Forms.Cursors]::WaitCursor
        }
      }
      $sha = (git rev-parse --short HEAD 2>$null | Out-String).Trim()
      $subject = (git log -1 --format=%s 2>$null | Out-String).Trim()
    } finally { Pop-Location }
  }

  $lblHint.Text = 'Güncelleme paketi hazırlanıyor... Bu işlem birkaç dakika sürebilir.'
  [System.Windows.Forms.Application]::DoEvents()

  $desktop = Get-BaykusDesktopPath
  if (-not $desktop) {
    $form.Cursor = [System.Windows.Forms.Cursors]::Default
    [System.Windows.Forms.MessageBox]::Show('Masaüstü klasörü bulunamadı.', 'Yeni Sürüm', 'OK', 'Error') | Out-Null
    return
  }
  $zipPath = Join-Path $desktop 'Baykus_Guncelleme.zip'
  $stage = Join-Path $env:TEMP ('baykus_surum_' + (Get-Date -Format 'yyyyMMdd_HHmmss'))
  try {
    if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $stage | Out-Null

    $xd = @('.git', 'tmp', 'Yedekler', '__pycache__', '.pytest_cache', '.next', '.turbo', '.ruff_cache', 'uploads', 'backups', '.venv', 'venv', 'packaging')
    $rootRuntime = Join-Path $Root 'runtime'
    $skipRuntime = -not (Test-RealBaykusRuntime $rootRuntime)
    if ($skipRuntime) { $xd += 'runtime' }
    $xf = @('baykus.db', 'baykus.db-journal', '.env', '.env.local', '*.zip', '*.tgz', '*.log')
    $roboArgs = @($Root, $stage, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/nc', '/ns', '/np', '/XD') + $xd + @('/XF') + $xf
    & robocopy @roboArgs | Out-Null
    if ([int]$LASTEXITCODE -ge 8) {
      [System.Windows.Forms.MessageBox]::Show("Dosyalar pakete kopyalanamadı (robocopy $LASTEXITCODE).", 'Yeni Sürüm', 'OK', 'Error') | Out-Null
      return
    }

    if (-not (Test-RealBaykusRuntime (Join-Path $stage 'runtime'))) {
      $foundRt = $null
      $deskDirs = @(Get-ChildItem -LiteralPath $desktop -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -like 'Baykus_Tasinabilir*' })
      foreach ($d in $deskDirs) {
        $candidate = Join-Path $d.FullName 'runtime'
        if (Test-RealBaykusRuntime $candidate) { $foundRt = $candidate; break }
      }
      if ($foundRt) {
        & robocopy $foundRt (Join-Path $stage 'runtime') /E /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
      }
    }

    $hasRuntime = Test-RealBaykusRuntime (Join-Path $stage 'runtime')
    $hasNm = Test-Path -LiteralPath (Join-Path $stage 'apps\web\node_modules')
    $rtFlag = 'yok'
    if ($hasRuntime) { $rtFlag = 'var' }
    $nmFlag = 'yok'
    if ($hasNm) { $nmFlag = 'var' }
    $when = Get-Date -Format 'yyyy-MM-dd HH:mm'
    $marker = @"
BAYKUS_GUNCELLEME
tur=guncelleme
tarih=$when
git=$sha
konu=$subject
runtime=$rtFlag
node_modules=$nmFlag
db=YOK
uploads=YOK
not=İşyeri baykus.db ve uploads bu pakette yoktur. Güncelle yedek alır, kodu ve runtime kopyalar, veriyi geri yazar.
"@
    $enc = New-Object System.Text.UTF8Encoding $true
    [System.IO.File]::WriteAllText((Join-Path $stage 'BAYKUS_GUNCELLEME.marker'), $marker.Trim() + "`r`n", $enc)
    $oku = @"
BAYKUŞ GÜNCELLEME PAKETİ
========================
Bu pakette işyeri veritabanı YOKTUR.
baykus.db ve uploads kopyalanmaz.

İşyerinde:
1) Bu zip dosyasını masaüstüne veya USB köküne koyun.
   Adı aynen kalsın: Baykus_Guncelleme.zip
2) Baykuş panelini açın (Baykus.bat).
3) Güncelle düğmesine basın.

Elle dosya kopyalamayın. Panel yedek alır, kodu günceller, defteri geri koyar.
"@
    [System.IO.File]::WriteAllText((Join-Path $stage 'OKU_GUNCELLEME.txt'), $oku.Trim() + "`r`n", $enc)

    if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
    $tar = Join-Path $env:SystemRoot 'System32\tar.exe'
    if (-not (Test-Path -LiteralPath $tar)) {
      [System.Windows.Forms.MessageBox]::Show('tar.exe bulunamadı. Zip oluşturulamadı.', 'Yeni Sürüm', 'OK', 'Error') | Out-Null
      return
    }
    Push-Location $stage
    try {
      & $tar -a -c -f $zipPath *
      if ($LASTEXITCODE -ne 0) {
        [System.Windows.Forms.MessageBox]::Show("Zip oluşturulamadı (tar $LASTEXITCODE).", 'Yeni Sürüm', 'OK', 'Error') | Out-Null
        return
      }
    } finally { Pop-Location }

    if (-not (Test-Path -LiteralPath $zipPath)) {
      [System.Windows.Forms.MessageBox]::Show('Zip yazılmadı.', 'Yeni Sürüm', 'OK', 'Error') | Out-Null
      return
    }
    $rtMsg = 'Taşınabilir runtime pakete girdi.'
    if (-not $hasRuntime) {
      $rtMsg = "Bu bilgisayarda taşınabilir runtime (runtime\python veya runtime\node) yok.`nPakete kod girdi. İşyerindeki runtime silinmez, yerinde kalır."
    }
    $nmMsg = 'Web paketleri (node_modules) pakete girdi.'
    if (-not $hasNm) { $nmMsg = 'node_modules bulunamadı; işyerindeki eskisi durur.' }
    [System.Windows.Forms.MessageBox]::Show(
      "Güncelleme paketi hazır:`n$zipPath`n`n$rtMsg`n$nmMsg`nbaykus.db ve uploads pakette YOK.`n`nZip'i USB'ye veya işyeri masaüstüne kopyalayın.`nİşyerinde panelden Güncelle'ye basın.",
      'Yeni Sürüm', 'OK', 'Information') | Out-Null
  } catch {
    [System.Windows.Forms.MessageBox]::Show("Paket oluşturulamadı:`n$($_.Exception.Message)", 'Yeni Sürüm', 'OK', 'Error') | Out-Null
  } finally {
    if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue }
    $form.Cursor = [System.Windows.Forms.Cursors]::Default
    $lblHint.Text = 'CMD penceresi açılmaz. Durum her 2 sn yenilenir.'
  }
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
$form.Size = New-Object System.Drawing.Size(440, 448)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedSingle'
$form.MaximizeBox = $false
$form.MinimizeBox = $true
$form.Font = New-Object System.Drawing.Font('Segoe UI', 10)

$title = New-Object System.Windows.Forms.Label
$title.Text = 'Baykuş Baskı — Kontrol'
$title.Location = New-Object System.Drawing.Point(16, 12)
$title.Size = New-Object System.Drawing.Size(400, 24)
$title.Font = New-Object System.Drawing.Font('Segoe UI', 12, [System.Drawing.FontStyle]::Bold)
$form.Controls.Add($title)

$lblApi = New-Object System.Windows.Forms.Label
$lblApi.Location = New-Object System.Drawing.Point(16, 48)
$lblApi.Size = New-Object System.Drawing.Size(400, 22)
$lblApi.Text = 'API (8000): ...'
$form.Controls.Add($lblApi)

$lblWeb = New-Object System.Windows.Forms.Label
$lblWeb.Location = New-Object System.Drawing.Point(16, 72)
$lblWeb.Size = New-Object System.Drawing.Size(400, 22)
$lblWeb.Text = 'Web (3000): ...'
$form.Controls.Add($lblWeb)

$lblHint = New-Object System.Windows.Forms.Label
$lblHint.Location = New-Object System.Drawing.Point(16, 98)
$lblHint.Size = New-Object System.Drawing.Size(400, 30)
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

$btnStart = New-Btn 'Başlat' 16 140
$btnStop = New-Btn 'Durdur' 220 140
$btnBrowser = New-Btn 'Tarayıcıyı Aç' 16 186
$btnBackup = New-Btn 'Yedek Al' 220 186
$btnUpdate = New-Btn 'Güncelle' 16 232
$btnKurulum = New-Btn 'Kurulum' 220 232
$btnRelease = New-Btn 'Yeni Sürüm Oluştur' 16 278 394

$hasKurulum = Test-Path (Join-Path $Root 'kurulum.bat')
$btnKurulum.Enabled = $hasKurulum
if (-not $hasKurulum) { $btnKurulum.Text = 'Kurulum (yok)' }

$btnTray = New-Btn 'Tepsiye Küçült' 16 324 394

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
  $btnUpdate.Enabled = $false
  try { Invoke-BaykusUpdate } finally {
    $btnUpdate.Enabled = $true
    $form.Cursor = [System.Windows.Forms.Cursors]::Default
    $lblHint.Text = 'CMD penceresi açılmaz. Durum her 2 sn yenilenir.'
    Update-StatusLabels
  }
})
$btnRelease.Add_Click({
  $btnRelease.Enabled = $false
  try { Invoke-BaykusNewRelease } finally {
    $btnRelease.Enabled = $true
    $form.Cursor = [System.Windows.Forms.Cursors]::Default
    $lblHint.Text = 'CMD penceresi açılmaz. Durum her 2 sn yenilenir.'
  }
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

