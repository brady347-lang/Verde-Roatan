# Verde Roatán 2.4.1 — first test build checklist

## A. Prepare Supabase photo uploads

- [ ] Run `supabase/migrations/20261103_verde_catalog_photo_upload.sql` in the Supabase SQL Editor.
- [ ] In the trusted Supabase admin interface, set the authorized admin user's **app_metadata** to include `role: admin` (do not use user-editable `user_metadata`).
- [ ] Sign out and sign back in so the app receives a fresh JWT containing the claim.
- [ ] Open the admin catalog, select an existing product, upload a JPG/PNG/WebP image under 15 MB.
- [ ] Confirm the image object appears under `product-images/<product-id>/` in Supabase Storage.
- [ ] Confirm the matching `public.products.image_url` is the public Storage URL.
- [ ] Refresh the app and confirm the product photo persists from the catalog API.

## B. Build Android APK from a phone

- [ ] Upload/push this complete project to a private GitHub repository. Keep `.env.local`, service-role keys, passwords, and signing keys out of Git.
- [ ] Enable GitHub Actions for the repository.
- [ ] Open **Actions → Build Verde Roatan Android APK → Run workflow**.
- [ ] Wait for all steps to pass.
- [ ] Download the `verde-roatan-debug-apk` artifact from the completed workflow run and extract `app-debug.apk`.
- [ ] Install on an Android test phone. Android may ask to allow installation from the browser/files app used to open the APK.

## C. App smoke tests

- [ ] Launch app; confirm home screen and navigation render.
- [ ] Confirm catalog loads and HNL prices are displayed.
- [ ] Sign in and sign out; confirm session restoration after app restart.
- [ ] Upload an admin product photo and verify it remains after restart.
- [ ] Test plant identification with a real plant photo; confirm Gemini worker response and user photo remain visible.
- [ ] Confirm generic reference images without photographer/source/license metadata are not labeled as verified species references.
- [ ] Test currency refresh and confirm the offline fallback is clearly identified if the currency worker is unavailable.
- [ ] Test checkout only with a controlled test order; confirm a real server response before treating it as placed.
- [ ] Test Android back navigation, app resume, and slow/interrupted network behavior.

## Notes

This is a **debug test APK**, not a signed public release. Google Play distribution requires a private release keystore and protected signing secrets. The first APK build also requires this source ZIP to be pushed to GitHub; this working environment could not complete dependency installation or Android Gradle compilation.
