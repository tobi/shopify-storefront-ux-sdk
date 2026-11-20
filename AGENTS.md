# AGENTS.md

This repository (`shopify-storefront-ux-sdk`) is a **super idiomatic `ux/sdk` implementation of everything you need for building excellent Shopify stores**.

## Vision & Principles

- **Idiomatic `ui-sdk` architecture.** Every storefront behavior is authored once as a framework-agnostic `definePrimitive` in `src/primitives/` on top of `@ui-sdk/core`, then projected into three thin, idiomatic adapters:
  - **Web Components** (`src/web/`, package default `.`) built on `@ui-sdk/web`
  - **SolidJS** (`src/solid/`, package entry `./solid`) built on `@ui-sdk/solid`
  - **React** (`src/react/`, package entry `./react`) built on `@ui-sdk/react`
  - **Headless Core** (`src/core.ts`, package entry `./core`) with zero DOM side effects
- **Own the commerce, never the markup or styles.** Components are headless, light-DOM / render-prop friendly, and never trap markup in Shadow DOM or baked-in HTML strings. Keyboard navigation, focus management, dismissal, live announcements, and ARIA come from `@ui-sdk/*`; product data, Shopify CDN image sizing, variant resolution, pricing, catalog search/filtering, and cart mutations come from this SDK.
- **Controlled and uncontrolled state everywhere.** Controllable state (`value`, `open`, `quantity`, `query`, `filter`, `vendor`, `onSale`, `sort`) accepts both `value` + `onValueChange` and `defaultValue`, fires cancelable change events carrying `{ value, reason, event, source }`, and never echoes programmatic writes.
- **Agent-ready by default.** Every meaningful user action is exposed on `api` and declared in `agent.actions`. Agent invocations travel through the same `api` and cancelable events with `source: "agent"`. Interactive controls must always have accessible names (zero unnamed controls in `agent.snapshot()`), and irreversible actions like checkout must be gated with `data-agent-confirm`.
- **Real Shopify Storefront API idioms.**
  - All Storefront GraphQL queries and mutations honor `@inContext(country, language)` and support optional `X-Shopify-Storefront-Access-Token` (`token`) alongside tokenless endpoints (`mock.shop`, public storefront endpoints).
  - Images use Shopify CDN responsive `srcset`s capped at source dimensions (max 5,760px), intrinsic `width`/`height`, eager high-priority LCP hints, and intent-based preloading that respects `saveData` / 2G.
  - Variant selection keeps a single source of truth (the variant ID), keeps sold-out and cross-combination choices visible and selectable with clear accessible text, and resolves nearest available combinations rather than dead-ending shoppers.
  - Cart state persists to `localStorage`, syncs across tabs, detects price changes, supports undo on line removal, free-shipping progress, discount code apply/remove, and stale-cart recovery.
- **Upstream reusable commerce patterns.** When building a store in `examples/` uncovers a reusable Shopify commerce need (catalog facets, price/savings math, quick-add, cart totals, discount removal, media galleries, bundles), upstream it into `src/core.ts` and all three adapters rather than accumulating app-local workarounds.

## Repository Layout

```text
src/
  shop.ts               Storefront API client, @inContext, cart store, announcements, undo
  images.ts             Shopify CDN URL transforms, srcset, imageAttrs, intent preload
  variants.ts           Variant model, option resolution, money/discount/savings helpers
  directory.ts          mock.shop store directory & search
  core.ts               Headless entry (data + primitives, zero DOM side effects)
  index.ts              Default entry (registers Web Components + re-exports core)
  shop.css              Optional base stylesheet for Web Components
  primitives/           Framework-agnostic definePrimitive definitions
  web/                  @ui-sdk/web custom element adapters
  solid/                @ui-sdk/solid component adapters
  react/                @ui-sdk/react component adapters
test/                   Unit tests for data layer and headless primitives
examples/
  snowdevil-solid/      Simplified Snowdevil storefront (SolidJS)
  snowdevil-react/      Simplified Snowdevil storefront (React)
  snowdevil-webcomponents/  Simplified Snowdevil storefront (Web Components)
```

## Development & Verification

- Use `bun` for installing, testing, and running examples (`bun install`, `bun test`, `bun run typecheck`).
- Always verify changes with:
  1. `bun run typecheck` (checks core/web, Solid, and React adapters independently with strict TypeScript)
  2. `bun test` (unit tests covering CDN images, variant model, pricing, catalog, product, bundle, and cart primitives)
  3. Building/typechecking the `examples/snowdevil-*` storefronts when touching adapters or example code.
