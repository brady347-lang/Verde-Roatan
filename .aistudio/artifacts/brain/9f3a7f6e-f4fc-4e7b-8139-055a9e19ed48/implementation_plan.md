# Implementation Plan: Botanical Photo Cropping, Rapid Identification, and Strict Catalog Matching

## 1. Context & Objectives
Based on your feedback, this plan introduces three critical enhancements to the plant identification and catalog matching flow:
1. **Interactive Photo Cropper**: An intuitive touch/mouse crop & zoom modal allowing users to isolate leaves, flowers, or pest damage before analysis. This discards background noise and cuts payload size by up to 85%.
2. **Accelerated Identification Protocol (3-Second Timeout)**: High-speed pre-compression (downscaling to max 720px, 0.75 JPEG), elimination of artificial timeouts in `api.ts`, optimized server-side Gemini 2.5 Flash prompt with streaming/quick response, and an active `AbortController` timeout (3s) with an instant intelligent botanical fallback if connection latency spikes.
3. **Strict Species & Genus Catalog Matching**: Elimination of generic family/tag overlap (e.g., searching an Areca Palm will never display Coconut Palms or unrelated palms). The catalog matching engine will rigorously check exact species, exact genus, or exact common name aliases, presenting the "Not in Nursery Catalog" card with "Request Special Sourcing" for any unmatched specimen.

---

## 2. Technical Architecture & File Changes

### Step 1: Interactive Leaf/Flower Cropping Component (`src/components/ImageCropModal.tsx`)
- **Interactive Canvas Cropper**:
  - Drag-to-position crop box over preview image with corner anchors.
  - Zoom slider and pan controls for fine-grained leaf/flower inspection.
  - Real-time resolution indicator showing optimized payload size.
  - Quick action buttons: **"Crop & Identify (Recommended)"** vs. **"Use Full Photo"**.
  - High-performance canvas export rendering cleanly at max 720×720px at 0.75 JPEG quality (~35–50 KB payload).

### Step 2: Accelerated Identification Pipeline (`src/services/api.ts` & `server.ts`)
- **Client Pipeline (`src/services/api.ts`)**:
  - Remove all synthetic `setTimeout` latency gates.
  - Wrap network calls to `/api/analyze` in an `AbortController` with an aggressive 3500ms timeout.
  - Direct fallback to verified Roatán botanical repository if the network hangs or times out, guaranteeing instant UI response without spinning loaders.
- **Server Pipeline (`server.ts`)**:
  - Streamline the Gemini 2.5 Flash system prompt to return streamlined JSON containing scientific taxonomy, common names, Roatán microclimate care, and exact botanical attributes.
  - Fast-path cached lookup for identical or near-identical tropical taxa.
  - Maintain verified specimen high-res reference photos via `resolveBotanicalReferencePhotos`.

### Step 3: Strict Botanical Matching Engine (`src/screens/IdentifyScreen.tsx`)
- **Strict Taxonomy Matching**:
  - Parse scientific name into `genus` (e.g., `Dypsis`) and `species` (e.g., `lutescens`).
  - Catalog match condition:
    1. Exact normalized scientific name match (`item.scientific_name.toLowerCase() === identified.scientific_name.toLowerCase()`), OR
    2. Exact species token match (`item.scientific_name` contains both identified genus and species), OR
    3. Normalized exact common name or primary alias match.
  - Explicitly filter out unrelated plants sharing broad categories (e.g., matching "Palm" or "Tropical" will NOT trigger catalog availability).
- **Not in Catalog Experience**:
  - When no exact match exists in the live nursery catalog, show the prominent **"Specimen Not in Live Catalog"** banner with direct **"Request Special Sourcing"** button, opening the WhatsApp inquiry modal prefilled with the identified plant's exact Latin and common name.

---

## 3. Verification & Testing Steps
1. **Interactive Cropper**: Test uploading high-resolution leaf photos from mobile and desktop, adjust crop box, verify responsive touch gestures, and ensure cropped output sends cleanly.
2. **Speed & Latency**: Test identification across simulated networks; verify response returns within 1.5–3 seconds without hanging.
3. **Strict Catalog Accuracy**:
   - Identify *Areca Palm* (`Dypsis lutescens`) -> Only Areca Palm catalog item appears; Coconut Palm and Traveler's Palm are suppressed.
   - Identify an exotic specimen not in catalog (e.g., *Plumeria alba* or *Rare Heliconia*) -> Correctly renders "Not in Nursery Catalog" banner and launches Special Sourcing modal.
4. **Build Verification**: Run `lint_applet` and `compile_applet` to confirm zero TypeScript and bundling errors.
