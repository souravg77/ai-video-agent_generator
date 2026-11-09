import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';

const PROJECT_FILTER = [{ name: 'NOVA FLOW project', extensions: ['novaflow'] }];

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1600,
    height: 980,
    minWidth: 1180,
    minHeight: 720,
    backgroundColor: '#0d0f14',
    title: 'NOVA FLOW',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) void win.loadURL(devUrl);
  else void win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

ipcMain.handle('project:save', async (_e, args: { json: string; filePath?: string }) => {
  let filePath = args.filePath;
  if (!filePath) {
    const res = await dialog.showSaveDialog({ filters: PROJECT_FILTER, defaultPath: 'Untitled.novaflow' });
    if (res.canceled || !res.filePath) return { ok: false, canceled: true };
    filePath = res.filePath;
  }
  // Write to a temp file first so a crash never leaves a half-written project.
  const tmp = `${filePath}.tmp`;
  await fs.writeFile(tmp, args.json, 'utf8');
  await fs.rename(tmp, filePath);
  return { ok: true, filePath };
});

ipcMain.handle('project:open', async () => {
  const res = await dialog.showOpenDialog({ filters: PROJECT_FILTER, properties: ['openFile'] });
  if (res.canceled || res.filePaths.length === 0) return { ok: false, canceled: true };
  const filePath = res.filePaths[0];
  const json = await fs.readFile(filePath, 'utf8');
  return { ok: true, filePath, json };
});

ipcMain.handle('system:hardware', async () => {
  const os = await import('os');
  return { platform: process.platform, arch: process.arch, cpus: os.cpus().length, memoryGb: Math.round(os.totalmem() / 1e9) };
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
