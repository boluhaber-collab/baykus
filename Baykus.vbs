' Baykus panel — CMD penceresi acmadan PowerShell WinForms baslatir
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
ps1 = dir & "\BaykusPanel.ps1"
sh.CurrentDirectory = dir
' 0 = gizli pencere
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """", 0, False
