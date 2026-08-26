import { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createLogger, installProcessErrorHandlers } from "@jarvis/logger";
import { toErrorEnvelope } from "@jarvis/errors";

const logger = createLogger("electron:main");
installProcessErrorHandlers(logger);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let mainWindow: BrowserWindow | null = null;
let hudWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

const isDev = !app.isPackaged;
const rendererUrl = process.env.VITE_DEV_SERVER_URL ?? "http://localhost:5173";
const rendererIndex = path.join(__dirname, "..", "dist-renderer", "index.html");

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
  app.on("web-contents-created", (_event, contents) => {
    contents.session.setPermissionRequestHandler((_webContents, permission, callback) => {
      callback(permission === "media");
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

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
      hudWindow = createHudWindow();
    }
  });
});

app.on("before-quit", () => {
  app.isQuiting = true;
});

declare global {
  namespace Electron {
    interface App {
      isQuiting?: boolean;
    }
  }
}
