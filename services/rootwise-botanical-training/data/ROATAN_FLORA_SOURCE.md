# Roatán botanical taxonomy seed — source review

## Primary local checklist

Calix-García, J.A., Argueta-Silva, T.E., Valle-Caballero, T.F. & Ramos-Cruz, A.J. (2025), *Flora del Municipio de Roatán, Islas de la Bahía, Honduras / Flora of the Municipality of Roatán, Bay Islands, Honduras*, Scientia hondurensis 5(1), DOI: https://doi.org/10.5281/zenodo.15870761.

The study reports 381 plant/algal records overall, including 347 terrestrial species across 104 families and 34 coastal-marine transition species. It draws on municipal tree-cutting inventories, environmental licensing files, project characterizations, and marine monitoring records. It reports a mix of native and introduced flora and flags conservation status for a subset.

A 2025 companion annex, *Especies Vegetales del Municipio de Roatán*, DOI https://doi.org/10.5281/zenodo.15871960, provides a species/family checklist and conservation/CITES columns.

## How RootWise will use these sources

- Use the Roatán checklist as the local taxonomic starting point, not as a ready-made image training set.
- Normalize scientific names and synonyms against a maintained taxonomic authority (for example, World Flora Online, Tropicos, and GBIF) before assigning stable taxon IDs.
- Preserve the source's native/introduced/invasive and conservation notes as separate metadata with provenance; do not silently convert a national status into an island-specific status.
- Begin the first image-model release with terrestrial vascular plants and common cultivated plants. Keep marine algae and seagrasses as a separately scoped future model/domain because their visual appearance and habitat differ substantially.
- Prioritize common local trees, palms, fruit trees, ornamentals, mangroves, coastal plants, and invasive species, then expand coverage.
- Treat genus-only entries (for example, records recorded only as *Ficus* spp.) as genus-level observations, not invented species labels.

## Initial named examples in the 2025 local paper

The paper explicitly discusses or illustrates *Bursera simaruba*, *Cecropia peltata*, *Cordia alliodora*, *Attalea cohune*, *Spondias mombin*, *Mangifera indica*, *Cocos nucifera*, *Terminalia catappa*, *Rhizophora mangle*, *Laguncularia racemosa*, *Avicennia germinans*, *Conocarpus erectus*, *Thespesia populnea*, *Hibiscus tiliaceus*, *Pachira aquatica*, *Annona glabra*, *Thalassia testudinum*, and *Syringodium filiforme*.

This is a starter list for data collection, not a complete or already verified RootWise class list. Each class must have accepted taxonomy, independent labelled photographs, image rights, and review before training.

## Image data rights

The checklist is a source of taxonomic leads; it does not grant rights to reuse photographs reproduced in the paper or elsewhere. Every training/reference image must have its own traceable source record and license or explicit permission allowing the intended use, including model training and commercial app distribution where applicable.
