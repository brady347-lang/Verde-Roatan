# Verde Roatán · Plant Intelligence

Mobile-first React + TypeScript application for tropical plant intelligence, nursery catalog, island delivery, and landscaping services in Roatán, Honduras.

## Development

- Node.js 22+
- `npm install`
- Copy `.env.example` to `.env.local` and configure only the server-side values needed by the local Express/Gemini development server.
- `npm run dev`
- `npm run build`
- `npm run lint`

The deployed Supabase, catalog, currency, and Gemini worker URLs remain configured in the existing application. Do not place Supabase service-role credentials in frontend code.

## Android test build

See [ANDROID_BUILD_GUIDE.md](./ANDROID_BUILD_GUIDE.md). Capacitor packages the production web build; GitHub Actions can generate a downloadable debug APK without a local Android SDK.

## Supabase product-photo uploads

Before testing the admin photo upload, run `supabase/migrations/20261103_verde_catalog_photo_upload.sql` and assign the authorized admin account the trusted `app_metadata.role = admin` claim. See [ANDROID_BUILD_GUIDE.md](./ANDROID_BUILD_GUIDE.md) for the setup checklist.
