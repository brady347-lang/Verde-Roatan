# Verde Roatán – Google Play release guide

## Already done
- App id: `com.verderoatan.plantintelligence`
- Workflow **Verde Roatan - Google Play Bundle (AAB)** builds a release `.aab` targeting Android 16 (API 36), which Google Play requires for new apps and updates since Aug 31 2026.

## One-time setup (on GitHub → repo → Settings → Secrets and variables → Actions)
Add four secrets: `PLAY_UPLOAD_KEYSTORE_B64`, `PLAY_UPLOAD_STORE_PASSWORD`, `PLAY_UPLOAD_KEY_ALIAS`, `PLAY_UPLOAD_KEY_PASSWORD`.
Keep a private backup of the upload keystore. Use **Play App Signing** (default) so a lost upload key can be reset by Google.

## Each release
1. Actions → *Verde Roatan - Google Play Bundle (AAB)* → Run workflow (main).
2. Download artifact `Verde-Roatan-Play-Bundle` (.aab); the log must say `SIGNED`.
3. Play Console → Production (or Internal testing first) → Create release → upload the .aab.

## Play Console items only the owner can complete
- Developer account ($25 one-time) and identity verification. Personal accounts created after Nov 2023 must run a closed test with 12+ testers for 14 days before Production.
- Privacy policy URL: https://verde-roatan-legal.brady347.workers.dev/privacy (live once the Legal Pages worker deploys). Account deletion URL: .../delete-account. Listing text: `docs/GOOGLE_PLAY_LISTING.md`.
- Data safety form (see `docs/PRIVACY_POLICY.md`, bottom), content rating questionnaire, target audience, app category.
- Store listing: 512×512 icon, 1024×500 feature graphic, 2–8 phone screenshots, short and full description.
- Account deletion: Play requires an in-app path and a web link to request deletion of an account and its data.
