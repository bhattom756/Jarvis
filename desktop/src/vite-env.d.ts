/// <reference types="vite/client" />

declare global {
  interface Window {
    jarvisDesktop: {
      toggleHud: () => Promise<boolean>;
    };
  }
}

export {};

