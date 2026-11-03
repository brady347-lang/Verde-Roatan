# Verde Roatán — Android test APK

This project uses Capacitor to package the existing Vite/React application as an Android app. The Android APK is built in GitHub Actions, so Android Studio and a desktop computer are not required on the phone used to trigger the build.

## First setup (one time)

1. Push this project to a private GitHub repository. Do not commit `.env.local`, service-role keys, passwords, or signing keystores.
2. Open the repository's **Actions** tab and enable GitHub Actions if prompted.
3. Select **Build Verde Roatan Android APK** → **Run workflow**.
4. When the workflow completes, open its run and download the `verde-roatan-debug-apk` artifact. Extract the ZIP to obtain `app-debug.apk`.
5. Transfer the APK to the Android phone, allow installation from that source when Android asks, and install it.

A debug APK is for internal testing. A signed release APK/AAB for Google Play requires a private signing keystore and protected GitHub secrets; do not use a debug key for a public release.

## Rebuild after changes

Run the same workflow manually, or push a tag such as `android-v0.1.0` to trigger it.

## Supabase photo upload prerequisite

Run `supabase/migrations/20261103_verde_catalog_photo_upload.sql` in the Supabase SQL Editor. Then set the authorized admin user's **app_metadata** claim to `{ "role": "admin" }` using a trusted Supabase admin process/dashboard. Do not put a service-role key in the app or in GitHub Actions. The app uses the signed-in user's access token to upload to the existing public `product-images` bucket and update the matching catalog row. The photo URL is only shown as saved after Supabase confirms the database update.
