import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("jarvisDesktop", {
  toggleHud: () => ipcRenderer.invoke("jarvis:toggle-hud")
});

