# Plant Intelligence Core: Stage 1 audit, P0 and P1

Branch: feature/rootwise-unified-development (main merged in; Home | Explore | Identify | Tools kept).

## Added
- `src/lib/intelligenceCore.ts`: IntelligenceResult contract, provenance ranks and confidence ceilings, `resolveFact`, `resolveRecommendations` (conflict handling), `canEnterBotanicalMemory` (privacy gate), `feedbackToEvidence` (feedback is never verified truth).
- `src/lib/lightPipeline.ts`: measured vs estimated light, plant-specific interpretation, requirement candidates from Knowledge Center profiles (unverified never treated as fact), camera-vs-professional-meter evaluation.
- ToolsScreen: reading labelled "measured by device sensor"; no fake "0 lux"; manual lux moved under an Advanced fallback.
- Tests: `intelligenceCore.test.mjs`, `lightPipeline.test.mjs` (in `npm run test:worker`).

## Not done yet
- Type-check/build not run (no node_modules, no network in this session).
- Camera live-estimation UI, Knowledge-base-backed requirement lookup in the UI, DB migrations (none written or applied).
