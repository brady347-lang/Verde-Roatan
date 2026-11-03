# Verde Roatán – Front-end integration pass

This pass preserves the original React/TypeScript application and its existing Supabase and Cloudflare services. It does not modify the Supabase migration, deploy workers, or introduce new backend infrastructure.

## Changes made

- Catalog refresh now checks the existing Cloudflare API worker on every app launch. If the worker is unavailable, the last locally cached catalog is retained rather than being overwritten by seed data.
- Checkout no longer invents a local order number or reports a successful order when the checkout worker fails. A real server order identifier is required before the cart is cleared or local order tracking is created.
- Gemini plant/pest identification now uses the existing app endpoint and deployed Gemini worker; fabricated plant-identification and pest-diagnosis results were removed.
- Identification refinement now tries the deployed Gemini worker's `/refine` route as well as the existing app route. It does not mark an unrefined result as verified.
- Garden-advisor requests now also try the deployed Gemini worker's `/garden-advisor` route before using the offline horticultural fallback.
- Supabase sessions now save expiry metadata, refresh when possible, and are verified against Supabase on app startup. The administrator identity is taken from Supabase's returned user record.
- The admin command center now attempts to load actual orders, line items, order status history, messages, and financial transactions from Supabase after administrator authentication.
- Admin order-status advancement now calls the existing `advance_order_status` Supabase RPC before updating the front-end state. This lets the existing database function record the status history and its transaction event.
- Offline currency display fallback is clearly treated as a manual reference rate of 26 HNL/USD. When the currency worker responds, its live rate remains authoritative.

## Important integration boundaries

- The existing API worker remains responsible for `/plants` and `/checkout`.
- The existing Gemini worker remains responsible for plant/pest identification, refinement, and garden advice.
- The existing currency worker remains responsible for live exchange rates.
- The checkout RPC creates the permanent order and its line items. The front end no longer fabricates a replacement order if that operation fails.
- Some operational tables (notably notification events and supplier purchase requests) have row-level security enabled. The supplied migration does not define general authenticated-client policies for every such table, and the current deployed API worker does not expose all of them. The front end therefore retains its existing local operational view where it cannot safely write or read those tables. This pass does not weaken RLS or expose a service-role key in the browser.

## Verification

- All 32 TypeScript/TSX source files passed TypeScript transpilation syntax checks.
- A full Vite production build and full type-check could not be completed in this environment because dependency installation did not finish. Run `npm install` and `npm run build` in the target environment before publishing.
- No live Supabase or Cloudflare account was accessed or changed. Runtime behavior still needs a final check against the user's deployed services.

## 2026-11-03 — First Android / Supabase photo test-build preparation

- App version advanced to `2.4.1.0` / package `2.4.1`.
- Added Capacitor 7 configuration (`capacitor.config.ts`) for Android app id `com.verderoatan.plantintelligence` and relative Vite asset paths for the native WebView.
- Added `.github/workflows/android-apk.yml`. It installs npm dependencies, builds the existing Vite app, generates/syncs the Android platform, builds a debug APK with Gradle, and publishes the APK as a downloadable Actions artifact.
- Added `ANDROID_BUILD_GUIDE.md` with phone-friendly GitHub Actions build steps.
- Replaced the admin photo handler's local-only data-URL persistence with a direct Supabase Storage upload to the existing public `product-images` bucket, followed by an authenticated `products.image_url` update. It also attempts to keep a matching `catalog_items` row synchronized. A failed primary database update removes the newly uploaded object and does not claim success.
- Added `supabase/migrations/20261103_verde_catalog_photo_upload.sql`. It creates/ensures the public bucket and uses RLS policies that require the trusted JWT `app_metadata.role = admin` claim for product updates and image writes. The existing service-role worker can continue to access the database while bypassing RLS; the public product SELECT policy is restricted to active rows.
- Reference images returned by the existing Gemini server are now shown only when source, photographer, license name, and license URL metadata are present. Generic stock images without provenance are no longer presented as verified species references. This is a safety/provenance filter, not yet a new external botanical-image provider integration.

### Validation status

- TypeScript/TSX transpile syntax checks passed for the modified source/config files.
- Full `npm run build` and `npm run lint` could not be run in this environment: dependencies are not installed and npm package installation timed out. A direct `tsc --noEmit` attempt stopped because `vite/client` type definitions were unavailable.
- No Android APK was built in this environment. The included GitHub Actions workflow is the prepared cloud build path; it must be run from a GitHub repository to produce the downloadable debug APK.
- No remote Supabase database, Storage bucket, user metadata, or Cloudflare Worker was changed by this source preparation. The SQL migration must be applied in the user's Supabase project and the admin JWT app_metadata claim must be set before the photo upload test will pass.
