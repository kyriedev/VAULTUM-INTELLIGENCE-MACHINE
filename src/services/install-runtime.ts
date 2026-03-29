type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

function isStandaloneMode(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

export function bindInstallPrompt(button: HTMLButtonElement | null): void {
  if (!button) return;

  let deferredPrompt: BeforeInstallPromptEvent | null = null;

  const setInstalledState = (): void => {
    button.hidden = false;
    button.disabled = true;
    button.textContent = 'Installed';
  };

  const resetHiddenState = (): void => {
    button.hidden = true;
    button.disabled = false;
    button.textContent = 'Install App';
  };

  if (isStandaloneMode()) {
    setInstalledState();
    return;
  }

  resetHiddenState();

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    button.hidden = false;
    button.disabled = false;
    button.textContent = 'Install App';
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    setInstalledState();
  });

  button.addEventListener('click', async () => {
    if (!deferredPrompt) {
      button.hidden = false;
      button.disabled = true;
      button.textContent = 'Use browser install';
      window.setTimeout(() => {
        if (!isStandaloneMode()) {
          button.disabled = false;
          button.textContent = 'Install App';
        }
      }, 1800);
      return;
    }

    await deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => null);
    deferredPrompt = null;
    resetHiddenState();
  });
}

export function registerServiceWorker(): void {
  const isProd = Boolean((import.meta as any).env?.PROD);
  if (!('serviceWorker' in navigator) || !isProd) return;
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
