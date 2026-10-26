; Inno Setup script for the AI Video Agent Windows installer.
; Produces a self-contained per-user .exe that bundles a portable Node.js, a
; static FFmpeg and the app with its dependencies, so the end user installs
; nothing else for the core app. Compile with build.ps1 (it lays out payload\
; first); ISCC alone will not find the files without that step.

#define MyAppName "AI Video Agent"
#define MyAppPublisher "AI Video Agent"
#define MyAppURL "https://github.com/souravg77/ai-video-agent_generator"
#ifndef MyAppVersion
  #define MyAppVersion "0.1.0"
#endif

[Setup]
AppId={{B7E6B1A2-9C4D-4F3A-8E21-5D6C7A8B9C0D}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
; Install per-user into a writable location so the agent can write .env, out\
; and node_modules at runtime without administrator rights.
DefaultDirName={localappdata}\Programs\AI Video Agent
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
OutputDir=dist
OutputBaseFilename=ai-video-agent-setup-{#MyAppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName={#MyAppName}
UninstallDisplayIcon={app}\make-video.cmd

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Shortcuts:"

[Files]
; payload\ is assembled by build.ps1 (app\, runtime\node\, runtime\ffmpeg\, launchers).
Source: "payload\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{group}\AI Video Agent Studio"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\studio.vbs"""; WorkingDir: "{app}"; Comment: "Make videos in an app window (no console)"
Name: "{group}\AI Video Agent - Setup"; Filename: "{app}\setup.cmd"; WorkingDir: "{app}"; Comment: "Connect services or pick free local tools"
Name: "{group}\AI Video Agent - Local Setup (free mode)"; Filename: "{app}\local-setup.cmd"; WorkingDir: "{app}"; Comment: "Install Ollama and Piper and download the free model and voice"
Name: "{group}\AI Video Agent - Make a Video"; Filename: "{app}\make-video.cmd"; WorkingDir: "{app}"; Comment: "Turn a topic into a finished video"
Name: "{group}\AI Video Agent - Start Agent"; Filename: "{app}\start-agent.cmd"; WorkingDir: "{app}"; Comment: "Run the agent and open the review page"
Name: "{group}\Open Review Page"; Filename: "{app}\open-review.cmd"; WorkingDir: "{app}"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\AI Video Agent Studio"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\studio.vbs"""; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{sys}\wscript.exe"; Parameters: """{app}\studio.vbs"""; Description: "Open AI Video Agent Studio"; Flags: postinstall skipifsilent nowait

[UninstallDelete]
; Remove files the app creates at runtime so nothing is left behind.
Type: filesandordirs; Name: "{app}\app\node_modules"
Type: filesandordirs; Name: "{app}\app\out"
Type: files; Name: "{app}\app\.env"
