# Dataset intake

Do not commit image datasets to Git.

Provide two separately reviewed CSV manifests:

- `manifest.csv`: labelled training/validation/test photographs, with `observation_group` to prevent leakage between splits.
- `reference_manifest.csv`: approved reference photographs with source IDs, license details, review status, and optional expert verification source.

Start with a deliberately scoped pilot of locally important species. Confirm each species' accepted scientific name, synonyms, family, geographic relevance, and image reuse/training rights. Use multiple independent plants and capture sessions per species; do not treat multiple near-identical photos of one plant as independent observations.

Unknown, ambiguous, hybrid, cultivar, and pest images should not be forced into a species class. Keep them in a separate abstention/unknown evaluation set rather than inventing labels.
