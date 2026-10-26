' AI Video Agent Studio launcher (Windows).
' Starts the Studio server with NO console window, waits for it, then opens it
' in an Edge "app" window (chrome-less, looks native). Falls back to the default
' browser if Edge isn't found. Run by wscript.exe, so nothing flashes on screen.
Option Explicit

Dim fso, sh, root, app, nodeDir, ffDir, ollamaDir, piperDir, voice, modelsDir, env, url, i, up, http, edge
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh  = CreateObject("WScript.Shell")

root    = fso.GetParentFolderName(WScript.ScriptFullName)   ' the install folder
app     = root & "\app"
nodeDir = root & "\runtime\node"
ffDir   = root & "\runtime\ffmpeg\bin"
url     = "http://localhost:4321"

' Point Node, npm and FFmpeg at the bundled copies for the child process.
Set env = sh.Environment("PROCESS")
env("PATH")         = nodeDir & ";" & ffDir & ";" & env("PATH")
env("FFMPEG_PATH")  = ffDir & "\ffmpeg.exe"
env("FFPROBE_PATH") = ffDir & "\ffprobe.exe"
env("STUDIO_PORT")  = "4321"

' Bundled Ollama (writing) and Piper (voice) for free local mode.
ollamaDir = root & "\runtime\ollama"
piperDir  = root & "\runtime\piper"
voice     = piperDir & "\voices\en_US-lessac-medium.onnx"
modelsDir = root & "\models\ollama"
If fso.FolderExists(ollamaDir) Then env("PATH") = ollamaDir & ";" & env("PATH")
If fso.FolderExists(piperDir) Then
  env("PATH") = piperDir & ";" & env("PATH")
  If fso.FileExists(piperDir & "\piper.exe") Then env("PIPER_PATH") = piperDir & "\piper.exe"
  If fso.FileExists(voice) Then env("PIPER_VOICE") = voice
End If
' Keep downloaded models inside the app folder so uninstall removes them.
If Not fso.FolderExists(root & "\models") Then fso.CreateFolder(root & "\models")
If Not fso.FolderExists(modelsDir) Then fso.CreateFolder(modelsDir)
env("OLLAMA_MODELS") = modelsDir

sh.CurrentDirectory = app

' Start the Studio server hidden (window style 0), don't wait. If it's already
' running, this second copy just exits on the busy port and we open the window.
sh.Run """" & nodeDir & "\npm.cmd"" run studio", 0, False

' Wait up to ~20s for the server to answer, then open the window.
up = False
For i = 1 To 40
  WScript.Sleep 500
  On Error Resume Next
  Set http = CreateObject("MSXML2.XMLHTTP")
  http.Open "GET", url & "/health", False
  http.Send
  If Err.Number = 0 And http.Status = 200 Then up = True
  On Error GoTo 0
  If up Then Exit For
Next

edge = EdgePath()
If Len(edge) > 0 Then
  sh.Run """" & edge & """ --app=" & url, 1, False
Else
  sh.Run "explorer.exe " & url, 1, False
End If

Function EdgePath()
  Dim candidates, c
  candidates = Array( _
    sh.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\Microsoft\Edge\Application\msedge.exe", _
    sh.ExpandEnvironmentStrings("%ProgramFiles%") & "\Microsoft\Edge\Application\msedge.exe", _
    sh.ExpandEnvironmentStrings("%LocalAppData%") & "\Microsoft\Edge\Application\msedge.exe")
  For Each c In candidates
    If fso.FileExists(c) Then
      EdgePath = c
      Exit Function
    End If
  Next
  EdgePath = ""
End Function
