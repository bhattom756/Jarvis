/// <reference types="vite/client" />

declare global {
  interface Window {
    jarvisDesktop?: {
      toggleHud: () => Promise<boolean>;
      startNativeSpeechRecognition: () => Promise<{ started: boolean; error?: string }>;
      stopNativeSpeechRecognition: () => Promise<{ stopped: boolean }>;
      onNativeSpeechRecognition: (listener: (event: { type: string; text?: string; message?: string }) => void) => () => void;
      minimizeWindow: () => Promise<boolean>;
      maximizeWindow: () => Promise<boolean>;
      closeWindow: () => Promise<boolean>;
      isMaximized: () => Promise<boolean>;
    };
  }
}

export {};
