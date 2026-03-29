import '@/styles/main.css';
import { VaultumApp } from '@/App';
import { registerServiceWorker } from '@/services/install-runtime';

const app = new VaultumApp('app');
registerServiceWorker();
void app.init();
