# VAULTUM Migration Map

## Summary

Current folder: lightweight VAULTUM scaffold.

Source architecture to preserve: nearby `worldmonitor` shell/runtime patterns.

## Keep

- `src/app/app-context.ts`
- `src/app/data-loader.ts`
- `src/app/panel-layout.ts`
- `src/app/refresh-scheduler.ts`
- `src/app/search-manager.ts`
- `src/app/command-palette.ts`
- `src/services/bootstrap.ts`
- `src/services/data-freshness.ts`
- `src/services/persistent-cache.ts`
- `src/services/runtime-config.ts`
- `src/services/signal-aggregator.ts`
- `server/_shared/*`
- `api/bootstrap.js`
- `api/[domain]/v1/[rpc].ts`

## Rename

- `src/components/panels/CommodityPanel.ts` -> `src/components/panels/CommoditiesPanel.ts`

## Add Now

- `src/components/panels/DealerPressurePanel.ts`
- `src/services/liquidity/index.ts`
- `server/vaultum/liquidity/v1/*`
- `proto/vaultum/liquidity/v1/service.proto`

## Disable In V1 Product Surface

- webcam-first monitoring
- happy/good-news surfaces
- non-trading civic monitoring
- generic world-news framing

## First Files To Edit

1. `README.md`
2. `package.json`
3. `src/App.ts`
4. `src/styles/main.css`
5. `src/components/panels/index.ts`
6. `src/components/panels/CommoditiesPanel.ts`
7. `src/services/bootstrap.ts`
8. `src/services/options/index.ts`
9. `src/services/liquidity/index.ts`
