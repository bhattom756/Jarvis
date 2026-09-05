import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("jarvisDesktop", {
  toggleHud: () => ipcRenderer.invoke("jarvis:toggle-hud"),
  startNativeSpeechRecognition: () => ipcRenderer.invoke("jarvis:speech-recognition:start"),
  stopNativeSpeechRecognition: () => ipcRenderer.invoke("jarvis:speech-recognition:stop"),
  onNativeSpeechRecognition: (listener: (event: { type: string; text?: string; message?: string }) => void) => {
    const callback = (_event: Electron.IpcRendererEvent, payload: { type: string; text?: string; message?: string }) => listener(payload);
    ipcRenderer.on("jarvis:speech-recognition", callback);
    return () => ipcRenderer.removeListener("jarvis:speech-recognition", callback);
  },
  minimizeWindow: () => ipcRenderer.invoke("jarvis:window-minimize"),
  maximizeWindow: () => ipcRenderer.invoke("jarvis:window-maximize"),
  closeWindow: () => ipcRenderer.invoke("jarvis:window-close"),
  isMaximized: () => ipcRenderer.invoke("jarvis:window-is-maximized"),
});
