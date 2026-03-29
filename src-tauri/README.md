# Vaultum Desktop

This folder contains the Tauri desktop scaffold for Vaultum.

When you are ready to build desktop packages:

1. Install the Rust toolchain.
2. Install Tauri CLI dependencies.
3. Run `npm run desktop:dev` for local desktop runtime.
4. Run `npm run desktop:build` for installers/bundles.

Vaultum keeps the web app as the primary UI and uses Tauri as the desktop shell around the built Vite frontend.
