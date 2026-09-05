import { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, session } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createLogger, installProcessErrorHandlers } from "@jarvis/logger";
import { existsSync } from "node:fs";

const logger = createLogger("electron:main");
installProcessErrorHandlers(logger);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let mainWindow: BrowserWindow | null = null;
let hudWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let nativeSpeechProcess: ChildProcess | null = null;
let nativeSpeechOutput = "";
let nativeSpeechWanted = false;
let nativeSpeechStopping = false;
let nativeSpeechStopTimer: NodeJS.Timeout | null = null;
let nativeSpeechRestartTimer: NodeJS.Timeout | null = null;
let nativeSpeechRestartAttempts = 0;

const isDev = !app.isPackaged;
const rendererUrl = process.env.VITE_DEV_SERVER_URL ?? "http://localhost:5173";
const rendererIndex = path.join(__dirname, "..", "dist-renderer", "index.html");

function resolveNativeSpeechScript(): string | null {
  const candidates = [
    path.join(app.getAppPath(), "electron", "native-speech-recognition.ps1"),
    path.join(__dirname, "..", "electron", "native-speech-recognition.ps1"),
    path.join(__dirname, "native-speech-recognition.ps1"),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function sendNativeSpeechEvent(payload: unknown): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("jarvis:speech-recognition", payload);
}

function clearSpeechTimers(): void {
  if (nativeSpeechStopTimer) {
    clearTimeout(nativeSpeechStopTimer);
    nativeSpeechStopTimer = null;
  }
  if (nativeSpeechRestartTimer) {
    clearTimeout(nativeSpeechRestartTimer);
    nativeSpeechRestartTimer = null;
  }
}

function killNativeSpeechProcess(): void {
  if (!nativeSpeechProcess) return;
  nativeSpeechStopping = true;
  nativeSpeechProcess.kill();
  nativeSpeechProcess = null;
  nativeSpeechOutput = "";
}

function scheduleNativeSpeechRestart(): void {
  if (!nativeSpeechWanted || nativeSpeechRestartTimer) return;
  nativeSpeechRestartAttempts += 1;
  const delayMs = Math.min(8_000, 400 * 2 ** Math.min(nativeSpeechRestartAttempts - 1, 4));
  logger.warn("Restarting Windows speech recognition", { attempt: nativeSpeechRestartAttempts, delayMs });
  nativeSpeechRestartTimer = setTimeout(() => {
    nativeSpeechRestartTimer = null;
    if (!nativeSpeechWanted) return;
    const result = startNativeSpeechProcess();
    if (!result.started) {
      sendNativeSpeechEvent({
        type: "error",
        message: result.error ?? "Windows speech recognition could not restart.",
      });
    }
  }, delayMs);
}

function startNativeSpeechProcess(): { started: boolean; error?: string } {
  if (nativeSpeechProcess) return { started: true };

  const scriptPath = resolveNativeSpeechScript();
  if (!scriptPath) {
    const message = "Windows speech recognition script was not found. Restart JARVIS from apps/desktop.";
    logger.error(message);
    return { started: false, error: message };
  }

  try {
    nativeSpeechStopping = false;
    const speechProcess = spawn(
      "powershell.exe",
      ["-STA", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
      { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    nativeSpeechProcess = speechProcess;
    logger.info("Windows speech recognition started", { scriptPath });

    speechProcess.stdout.on("data", (chunk: Buffer) => {
      nativeSpeechOutput += chunk.toString();
      const lines = nativeSpeechOutput.split(/\r?\n/u);
      nativeSpeechOutput = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          sendNativeSpeechEvent(JSON.parse(trimmed));
        } catch {
          logger.warn("Ignoring malformed Windows speech recognition output", { line: trimmed });
        }
      }
    });
    speechProcess.stderr.on("data", (chunk: Buffer) => {
      logger.warn("Windows speech recognition stderr", { message: chunk.toString().trim() });
    });
    speechProcess.on("error", (error) => {
      logger.error("Windows speech recognition process failed", error);
      if (nativeSpeechWanted) {
        sendNativeSpeechEvent({ type: "error", message: "Windows speech recognition could not start." });
      }
    });
    speechProcess.on("exit", (code) => {
      if (nativeSpeechProcess === speechProcess) {
        nativeSpeechProcess = null;
        nativeSpeechOutput = "";
      }
      const unexpected = nativeSpeechWanted && !nativeSpeechStopping;
      nativeSpeechStopping = false;
      if (!unexpected) return;
      logger.warn("Windows speech recognition exited unexpectedly", { code });
      scheduleNativeSpeechRestart();
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start Windows speech recognition.";
    logger.error("Failed to start Windows speech recognition", error);
    return { started: false, error: message };
  }

  return { started: true };
}

function startNativeSpeechRecognition(): { started: boolean; error?: string } {
  nativeSpeechWanted = true;
  clearSpeechTimers();
  nativeSpeechRestartAttempts = 0;
  return startNativeSpeechProcess();
}

function stopNativeSpeechRecognition(options: { immediate?: boolean } = {}): void {
  nativeSpeechWanted = false;
  clearSpeechTimers();
  if (options.immediate) {
    killNativeSpeechProcess();
    return;
  }
  nativeSpeechStopTimer = setTimeout(() => {
    nativeSpeechStopTimer = null;
    if (nativeSpeechWanted) return;
    killNativeSpeechProcess();
  }, 400);
}

async function loadRenderer(win: BrowserWindow, hash = ""): Promise<void> {
  const url = isDev ? `${rendererUrl}${hash}` : `${rendererIndex}${hash}`;

  if (isDev) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        await win.loadURL(url);
        return;
      } catch (error) {
        await delay(250);
        if (attempt === 19) {
          throw error;
        }
      }
    }
    return;
  }

  await win.loadFile(rendererIndex, hash ? { hash: hash.slice(1) } : undefined);
}

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1420,
    height: 920,
    frame: false,
    transparent: true,
    hasShadow: false,
    backgroundColor: "#00000000",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js")
    }
  });
  win.setMenuBarVisibility(false);
  win.webContents.on("preload-error", (_event, preloadPath, error) => {
    logger.error("Desktop preload failed", error, { preloadPath });
  });
  win.webContents.on("did-finish-load", () => {
    void win.webContents
      .executeJavaScript("Boolean(window.jarvisDesktop?.onNativeSpeechRecognition)", true)
      .then((available) => logger.info("Desktop speech bridge status", { available }))
      .catch((error) => logger.error("Unable to inspect desktop speech bridge", error));
  });

  void loadRenderer(win).then(() => {
    if (!win.isDestroyed()) {
      win.show();
    }
  }).catch(() => {
    if (!win.isDestroyed()) {
      void win.loadFile(rendererIndex).then(() => win.show()).catch(() => undefined);
    }
  });

  win.on("close", (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      win.hide();
    }
  });
  return win;
}

function createHudWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 360,
    height: 220,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    movable: true,
    skipTaskbar: true,
    show: false,
    transparent: true,
    hasShadow: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js")
    }
  });
  win.setMenuBarVisibility(false);

  void loadRenderer(win, "#hud").catch(() => {
    void win.loadFile(rendererIndex, { hash: "hud" }).catch(() => undefined);
  });
  win.on("close", (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      win.hide();
    }
  });
  return win;
}

function createTray(): void {
  const image = nativeImage.createEmpty();
  tray = new Tray(image);
  tray.setToolTip("JARVIS");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open Dashboard", click: () => mainWindow?.show() },
      { label: "Show HUD", click: () => hudWindow?.show() },
      { type: "separator" },
      { label: "Quit", click: () => app.quit() }
    ])
  );
  tray.on("click", () => mainWindow?.show());
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  session.defaultSession.setPermissionCheckHandler(() => true);
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(true);
  });
  app.on("web-contents-created", (_event, contents) => {
    contents.session.setPermissionCheckHandler(() => true);
    contents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(true);
    });
  });
  mainWindow = createMainWindow();
  hudWindow = createHudWindow();
  createTray();

  ipcMain.handle("jarvis:toggle-hud", () => {
    if (!hudWindow) return false;
    if (hudWindow.isVisible()) {
      hudWindow.hide();
      return false;
    }
    if (!hudWindow.webContents.isLoadingMainFrame()) {
      void hudWindow.show();
      return true;
    }
    hudWindow.show();
    return true;
  });

  ipcMain.handle("jarvis:speech-recognition:start", () => startNativeSpeechRecognition());
  ipcMain.handle("jarvis:speech-recognition:stop", () => {
    stopNativeSpeechRecognition();
    return { stopped: true };
  });

  ipcMain.handle("jarvis:window-minimize", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.minimize();
    return true;
  });

  ipcMain.handle("jarvis:window-maximize", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return false;
    if (win.isMaximized()) {
      win.unmaximize();
      return false;
    } else {
      win.maximize();
      return true;
    }
  });

  ipcMain.handle("jarvis:window-close", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.close();
    return true;
  });

  ipcMain.handle("jarvis:window-is-maximized", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win?.isMaximized() ?? false;
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
      hudWindow = createHudWindow();
    }
  });
});

app.on("before-quit", () => {
  app.isQuiting = true;
  stopNativeSpeechRecognition();
});

declare global {
  namespace Electron {
    interface App {
      isQuiting?: boolean;
    }
  }
}
