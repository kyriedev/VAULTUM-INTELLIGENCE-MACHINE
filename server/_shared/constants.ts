export const DEFAULT_NOW = () => new Date().toISOString();
export const VAULTUM_VERSION = '0.1.0';
export const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36';

let yahooQueue = Promise.resolve();
let yahooLastCall = 0;

export function yahooGate(): Promise<void> {
  yahooQueue = yahooQueue.then(async () => {
    const now = Date.now();
    const waitMs = Math.max(0, 450 - (now - yahooLastCall));
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    yahooLastCall = Date.now();
  });
  return yahooQueue;
}
