; LumenX Studio - Inno Setup installer script
;
; Usage:
;   1. Run .\build_windows.ps1 first (produces dist_windows\LumenX Studio\)
;   2. Compile this script:  iscc installer.iss   (Inno Setup 6.3+)
;   Output: dist_installer\LumenXStudio_Setup.exe
;
; Notes:
;   - Bump MyAppVersion for each release.
;   - User data in ~\.lumen-x\ is NOT touched by install/uninstall.

#define MyAppName "LumenX Studio"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "LumenX"
#define MyAppExeName "LumenX Studio.exe"

[Setup]
; AppId must stay identical across releases so upgrades replace, not duplicate
AppId={{8F7A2C1E-5D34-4B6A-9C21-7E0D4B5A6F31}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=dist_installer
OutputBaseFilename=LumenXStudio_Setup
SetupIconFile=LumenX.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
; Allow "install for me only" without admin rights (dirs switch to %LocalAppData%\Programs)
PrivilegesRequiredOverridesAllowed=dialog
ArchitecturesInstallIn64BitMode=x64compatible

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
; The whole onedir app bundle built by build_windows.ps1
Source: "dist_windows\{#MyAppName}\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion createallsubdirs
; Optional offline WebView2 bootstrap: drop MicrosoftEdgeWebview2Setup.exe into bin\ before compiling.
; If absent it is skipped - the app also auto-installs WebView2 at runtime.
Source: "bin\MicrosoftEdgeWebview2Setup.exe"; DestDir: "{tmp}"; Flags: skipifsourcedoesntexist deleteafterinstall

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#MyAppName}}"; Flags: nowait postinstall skipifsilent

[Code]
procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
begin
  if CurStep = ssPostInstall then
  begin
    // Silently install bundled WebView2 bootstrapper if it was included;
    // exits immediately when the runtime is already present.
    if FileExists(ExpandConstant('{tmp}\MicrosoftEdgeWebview2Setup.exe')) then
      Exec(ExpandConstant('{tmp}\MicrosoftEdgeWebview2Setup.exe'),
        '/install /passive /norestart', '', SW_SHOW, ewWaitUntilTerminated, ResultCode);
  end;
end;
