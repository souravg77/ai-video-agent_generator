import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('novaDesktop', {
  saveProject: (json: string, filePath?: string) => ipcRenderer.invoke('project:save', { json, filePath }),
  openProject: () => ipcRenderer.invoke('project:open'),
  hardware: () => ipcRenderer.invoke('system:hardware'),
});
