# RootWise — ChatGPT Work Handoff
Updated: 2026-11-08

This note preserves the active project context so work can continue in a fresh ChatGPT conversation without relying on the previous chat history.

## Repository and working location
- GitHub repository: https://github.com/brady347-lang/Verde-Roatan
- Base branch: `main`
- Active development branch: `feature/rootwise-unified-development`
- Continue RootWise work in this repository. Inspect the current `main` source before changing anything.
- The user has said the latest app build is already available in GitHub and does not want an unnecessary rebuild. Do not trigger or recommend another APK build unless a code change genuinely requires one and the user requests it.
- Do not assume that a slow or temporarily unresponsive app screen means the code needs rebuilding.

## Current development progress
- Round 1 is underway on `feature/rootwise-unified-development`.
- Commit `af24faf5b18fe5bcaa825a86f1f47cd1451509fa` fixes the irrigation estimator: the displayed emitter count now uses the entered area-per-plant value instead of the unrelated planting-spacing value.
- Example check: 80 m² area / 50 m² per plant = 1 estimated emitter; changing the area-per-plant input changes the result. This is a rough layout estimate, not a hydraulic design.
- No merge or deployment has been performed. Full project typecheck/build has not yet been run.

## Area measurement and GPS improvements (Round 2)
- Added Leaflet / React Leaflet with OpenStreetMap tiles to the landscape area tool. Three or more GPS corners render a shaded polygon; one or two points render location markers / a line. The map auto-fits captured points.
- Manual length/width now have a proportional rectangular diagram, clearly labeled as a diagram rather than a geographic map.
- Added Capacitor Geolocation and native permission check/request flow. Web fallback now distinguishes insecure HTTP, unavailable browser geolocation, permission denial and generic GPS failures. Error guidance includes Android Settings → Apps → Rootwise → Permissions → Location.
- New package dependencies: `@capacitor/geolocation`, `leaflet`, `react-leaflet`, `@types/leaflet`.
- Important Android follow-through: run `npm install` and `npx cap sync android` in the Android build environment so the Geolocation plugin is registered and its Android manifest permissions are merged. The repository branch does not currently contain a tracked `android/app/src/main/AndroidManifest.xml`, so native manifest merge and runtime permission prompts still need verification in the actual Android project.
- OpenStreetMap tiles require internet connectivity. The map is not an offline basemap.
- Validation outstanding: install dependencies, run `npm run lint`, `npm run build`, then test GPS permission grant/deny, precise/coarse location, three-corner polygon, map auto-fit, and manual rectangle on a physical Android device. No build, sync, merge or deployment has been performed in this chat.

## Current task to resume
Investigate the Botanical Knowledge Center → Reference Photos screen and the catalog-photo import experience.

Relevant merged work:
- PR #52 — “Add admin-only nursery catalog photo import to botanical review” — merged 2026-11-08. Commit: `6b95760334b22985d318c48508b90cc05de5a8e9`.
- PR #53 — “Protect identification uploads and require learning consent” — merged 2026-11-08. Commit: `f0d059c70ba1a98d14c4fdd468eec7253686e447`.

Verified source finding:
- `src/components/botanical/KnowledgeCenterPanel.tsx` on `main` contains the “Import catalog photos” interface.
- In the Reference Photos view, this card is positioned below the manual photo-upload section.
- The catalog discovery flow uses exact scientific-name matches and is admin-only. Imported photos enter pending curator review; they are not automatically approved or used in plant identifications.
- The app may currently be slow; investigate loading behavior and screen state before diagnosing a code defect. No rebuild is requested.

## Product direction and guardrails
- Product name: RootWise.
- Audience: professional landscapers and nurseries, with an international brand and Caribbean roots.
- The Botanical Knowledge Center should learn from permitted catalog-photo evidence and plant-identification evidence, as well as uploaded reference documents. Respect consent, privacy, curator review, and evidence-verification safeguards.
- Plant identification should ultimately use a real Python machine-learning capability alongside Gemini/AI assistance; do not describe the ML engine as already operational unless verified. PR #51 was only preparatory documentation for Python ML service integration, not proof of a live ML engine.
- Preserve existing working features and production data. Avoid broad rewrites or unnecessary migrations.

## Agreed collaboration and handoff sequence
- ChatGPT is handling the current active work phase: inspect the existing repository, maintain the ordered task list, make focused changes when justified, and record findings and commits.
- Work in numbered rounds. Keep the current round and its completed/pending steps updated in this handoff note so a fresh chat can resume accurately.
- At Round 12, prepare a clear handoff for Claude so Claude can take over the next phase. The handoff must include the current branch and commit, completed work, outstanding tasks, known risks, relevant files/PRs, and the exact next action. Do not assume Claude has taken over until that handoff is explicitly made.
- ChatGPT and Claude should work from the same GitHub source of truth. Avoid simultaneous conflicting edits; inspect recent commits before either agent writes.

## Next steps / active queue
1. Resume from current `main` and inspect the Reference Photos screen's loading and rendering path.
2. Determine whether the import card is below the manual upload form, delayed by slow loading, hidden by permissions, or absent in the served version.
3. Check relevant API/service calls and error handling if the card or candidate list does not load.
4. Make a focused fix only if repository evidence identifies a defect. Do not rebuild just to investigate.
5. Keep this handoff updated with the round number, exact files/commits changed, completed steps, and next unresolved task.
6. At Round 12, prepare the Claude takeover handoff described above.

## Collaboration preference
The user wants hands-on work directly in GitHub, clear continuity between chats, and practical follow-through. Avoid asking them to repeat context already recorded here.

## Area measurement persistence (Round 3 — in progress)
- Added `src/lib/measuredPlotStore.ts`: IndexedDB storage for measured plot names, GPS corner coordinates, estimated area/perimeter and timestamps.
- Updated `src/screens/ToolsScreen.tsx`: users can name and save a polygon after capturing at least three GPS points, reopen saved maps (restoring the points and map), and delete saved maps.
- Saved plot coordinates remain local to the device. This implementation does not upload or cloud-sync location data.
- Storage is separate from the existing photo database and uses its own IndexedDB database/store.
- Commits:
  - `5c769bf4e05245b961a40013f479f94aae3bf11c` — add local measured-plot storage.
  - `150443a5581ed1d505e52e8a3d7653566b13e7a2` — add save/reopen/delete UI.
  - `31a678d00ad49c424e21a2070c3961eb35605669` — harden IndexedDB result handling.
- Basic source inspection confirms the screen imports the store and includes save/open/delete handlers. Full typecheck/build and device runtime tests remain outstanding; no dependency install, Android sync, APK build, merge or deployment has been performed.
- Next validation: install project dependencies in a proper build environment, run `npm run lint` and `npm run build`, then on Android verify save → app restart → reopen → delete, plus behavior when IndexedDB is unavailable or storage is full.


## Site notes and planting estimates (Round 4 — in progress)
- Extended `SavedPlot` with optional `notes`, `plantSpacingM`, and `estimatedPlants` fields. Optional fields keep existing saved-map records readable without migration.
- The measured-map form now accepts site notes (soil, shade, slope, obstacles, and other project details).
- Saving a reopened plot updates the same record instead of creating a duplicate; Reset starts a new plot record.
- Saved map cards now show the estimated plant count and a short notes preview. Reopening restores the saved plant spacing and notes.
- These details and coordinates remain in device-local IndexedDB; no cloud sync or account sharing was added.
- Commits:
  - `7d4184440040e62d472c3e961b723f10972b6997` — extend saved plot model.
  - `72f7c1dd9a60aa691789d6af58145cb540d5e6ba` — add editable notes and planting estimates.
- Source-level checks confirmed the expected fields, restore handlers, form controls and reset behavior are present. This is not a substitute for `npm run lint`, `npm run build`, or physical-device testing; none has been run in this round.
- Next: add a basic planting layout visualization to the saved plot detail (starting with a square-grid estimate), while clearly labeling it as a planning approximation and allowing the user to adjust spacing. Later work can support species-specific spacing and mixed planting zones.


## Catalog-connected sod estimator (Round 5 — in progress)
- Updated `ToolsScreen` to receive the live `currentCatalog` from `App.tsx`, so the area tool uses the same current catalog as the shop.
- Added a sod/turf/lawn catalog selector using catalog names, scientific names, categories and tags. Existing catalog record found: `p-zoysia`, Empire Zoysia Sod (Per Sq Yd), HNL 140, size `1 Sq Yd Pallet Slab`, 120 recorded units, nursery Verde Roatán Nursery (Sandy Bay).
- The estimator converts measured square meters to square yards, rounds required slabs up, calculates subtotal from the selected catalog price, and compares the requirement with recorded stock. It warns when the estimate exceeds recorded stock and advises confirmation with the nursery; it does not reserve inventory or place an order.
- If no sod/turf/lawn item is present, the tool explicitly says none is currently listed instead of inventing a product.
- Saved plot records now retain selected surface-material ID/name and estimated units; reopening restores the catalog selection.
- Commits:
  - `2902f4bc3f701694034fc6a0290c798d62888af7` — connect measured area to sod catalog inventory.
  - `8ab2ba3db1bdc56a214e3865dc06c0840b64d31e` — pass live catalog from App.
  - `94043218e6fa99e791871ae7d0a812385099ed93` — extend saved plot material fields.
  - `5732e66d71d478be1db81cbf68b446b3848057f1` — save and restore sod choice.
- Source-level checks passed for catalog wiring, product matching, quantity/price/stock calculation, no-match messaging, and saved selection restoration. Arithmetic spot-check: 80 m² = 95.68 yd², rounded to 96 slabs; at HNL 140 each, estimated subtotal HNL 13,440. Recorded stock 120. This is a calculation/source inspection only, not full build or live inventory validation.
- Next: extend the same measured-area workflow to other surface materials (mulch, gravel, topsoil, pavers) only where catalog package/coverage units are explicit; avoid assuming every bag or pallet covers the same area. Add waste/cut allowance and a clear estimate-vs-confirmed-stock distinction.
- Still outstanding: `npm run lint`, `npm run build`, and physical Android testing. No APK build, merge, deployment or inventory reservation was performed.

## Optional natural landscaping materials (Round 6 — in progress)
- Expanded the measured-area workflow to support optional project materials: natural mulch, gravel/stone, topsoil, compost/soil blends, and pavers/stepping stones. The material selector defaults to None, so projects do not have to include these materials.
- Natural sod matching is now restricted to grass catalog records and explicitly excludes artificial/synthetic turf. Sod is also optional (the selector defaults to None); the existing Empire Zoysia natural sod record remains eligible.
- Saved-map cards display the selected sod and optional project material names so users can see the materials attached to a saved plot.
- Catalog matching is conservative. A material is priced and quantity-estimated only when its package size explicitly provides a usable liter volume. The existing Organic Roatán Coconut Coir Soil Blend is listed as a 40 L package and can be estimated under compost/soil blend. No catalog product or stock is fabricated for mulch, gravel, topsoil or pavers when a matching product is absent.
- Manual volume estimates remain available for bulk materials using area × depth plus a user-set settling/waste allowance. Pavers are intentionally excluded from volume math; their unit count requires exact piece dimensions/coverage data, which the current catalog does not yet provide.
- Saved plot records now optionally retain the selected project-material category, catalog product ID/name, and calculated units. Older records remain compatible because all new fields are optional.
- Commits:
  - `2cc56c119855de493978f70df2f2626ccd71157f` — add optional material categories and catalog matching.
  - `24df52a48778b6764937f5076767fd552e7011d1` — separate paver planning from volumetric calculations.
  - `febc863236926241649f63ab23ba70a6b5f58327` — correct package-volume parsing and reset behavior.
  - `e3bb691bd9b5e8833b417759b4acfc6479e8de20` — persist optional material selections on saved plots.
  - `f66435a9b6f19a58681e86c863a451aba7c4f460` — make natural sod optional and show saved project materials.
- Source inspection confirms the new categories, conservative package parsing, natural-sod-only filter, paver volume exclusion, and saved-plot fields. Full lint/typecheck/build and Android runtime tests have not been run. No APK build, merge, deployment or inventory reservation was performed.
- Next: add explicit structured coverage metadata to catalog items (e.g. liters per bag, square meters per unit, or cubic meters per bulk unit) rather than parsing display strings. Then implement paver counts and package-based mulch/gravel/topsoil calculations only for records with verified coverage. Review whether saved plot cards should summarize all selected project materials.

## Structured catalog material specifications (Round 7)
- Added optional `CatalogMaterialSpec` to `CatalogItem`, with explicit `package_volume_liters`, `coverage_area_m2`, and `unit_label`. Estimators no longer parse package-size display strings.
- Added verified specs to current starter catalog records:
  - Empire Zoysia: `coverage_area_m2: 0.83612736`, `unit_label: 1 sq yd slab`.
  - Organic Roatán Coconut Coir Soil Blend: `package_volume_liters: 40`, `unit_label: 40 L bag`.
- Sod quantity and subtotal now require explicit per-unit coverage. Other catalog materials require explicit package volume. Pavers use surface coverage rather than fill volume and only calculate when a matching product has verified coverage metadata.
- App catalog restoration now hydrates older localStorage records with the current starter catalog's verified `material_spec` by matching stable item IDs. Live catalog refresh also preserves the local/default spec when the API payload omits it, without overwriting an explicit remote spec.
- This avoids losing material coverage after app refresh or on devices with an older cached catalog. Custom catalog records without structured specs remain visible but do not receive guessed quantities/prices.
- Commits:
  - `224d288eee733d64682c3eb68ada2ae3c10d715f` — add structured material specification type.
  - `2eee94c9f78ded2cd6e491be963909ec32034fa7` — annotate starter sod and coir records.
  - `217d0e9e6741517da6126119e0b2ffcd65803877` — use structured specifications in the estimator.
  - `61a3f2d107778674cd86b12dead8397d7ce8ee23` — hydrate/preserve specs across cached and refreshed catalog records.
  - `33247a1ccc879cb465c62203c36006fd06a55b19` — prioritize paver area coverage over package volume.
- Source inspection is complete. Full TypeScript lint/build, Android runtime and live catalog API validation have not been run. No database schema change was made because the current API response is not yet modeled to expose these optional fields; specs for existing starter items are retained locally by stable ID.
- Next: expose `material_spec` through the authoritative catalog API and admin create/edit workflow, persist it in the backing catalog schema, then add calculation tests for volume packages, paver coverage, waste factors, and insufficient stock.
