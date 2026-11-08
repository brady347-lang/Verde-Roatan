# RootWise — ChatGPT Work Handoff
Updated: 2026-11-08

This note preserves the active project context so work can continue in a fresh ChatGPT conversation without relying on the previous chat history.

## Repository and working location
- GitHub repository: https://github.com/brady347-lang/Verde-Roatan
- Active integration branch: `main`
- Continue RootWise work in this repository. Inspect the current `main` source before changing anything.
- The user has said the latest app build is already available in GitHub and does not want an unnecessary rebuild. Do not trigger or recommend another APK build unless a code change genuinely requires one and the user requests it.
- Do not assume that a slow or temporarily unresponsive app screen means the code needs rebuilding.

## Current task to resume
Investigate the Botanical Knowledge Center → Reference Photos screen and the catalog-photo import experience.

Relevant merged work:
- PR #52 — “Add admin-only nursery catalog photo import to botanical review” — merged 2026-11-08. Commit: `6b95760334b22985d318c48508b90cc05de5a8e9`.
- PR #53 — “Protect identification uploads and require learning consent” — merged 2026-11-08. Commit: `f0d059c70ba1a98d14c4fdd468eec7253686e447`.

Verified source finding:
- `src/components/botanical/KnowledgeCenterPanel.tsx` on `main` contains the “Import catalog photos” interface.
- In the Reference Photos view, this card is positioned below the manual photo-upload section.
- The catalog discovery flow uses exact scientific-name matches and is admin-only. Imported photos enter pending curator review; they are not automatically approved or used in plant identifications.
- If the screen remains slow or the section fails to appear, investigate the current UI state, route, loading behavior, and deployed/source version before proposing a rebuild. Do not infer a build is required.

## Product direction and guardrails
- Product name: RootWise.
- Audience: professional landscapers and nurseries, with an international brand and Caribbean roots.
- The Botanical Knowledge Center should learn from permitted catalog-photo evidence and plant-identification evidence, as well as uploaded reference documents. Respect consent, privacy, curator review, and evidence-verification safeguards.
- Plant identification should ultimately use a real Python machine-learning capability alongside Gemini/AI assistance; do not describe the ML engine as already operational unless verified. PR #51 was only preparatory documentation for Python ML service integration, not proof of a live ML engine.
- Preserve existing working features and production data. Avoid broad rewrites or unnecessary migrations.

## Next steps
1. Resume from the current `main` branch and inspect the Reference Photos screen's loading and rendering path.
2. Determine whether the import card is merely below the manual upload form, delayed by slow loading, hidden by permissions, or absent in the version actually being served.
3. Check the relevant API/service calls and error handling if the card or candidate list does not load.
4. Make a focused fix only if the repository evidence identifies a defect. Do not rebuild just to investigate.
5. Report the exact files/commits changed and the next unresolved task so the user can continue in a new chat.

## Collaboration preference
The user wants hands-on work directly in GitHub, clear continuity between chats, and practical follow-through. Avoid asking them to repeat context already recorded here.