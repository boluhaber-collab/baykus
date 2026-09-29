' Baykus panel - CMD penceresi acmadan PowerShell WinForms baslatir
' BaykusPanel.ps1 must be UTF-8 with BOM for Turkish UI strings.
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
ps1 = dir & "\BaykusPanel.ps1"
sh.CurrentDirectory = dir
' 0 = gizli pencere; -File loads UTF-8 when ps1 has BOM
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """", 0, False
