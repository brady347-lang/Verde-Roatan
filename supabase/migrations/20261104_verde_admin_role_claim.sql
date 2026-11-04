-- Verde Roatan: give the administrator account the app_metadata role claim.
-- The storage and products policies in 20261103_verde_catalog_photo_upload.sql only allow
-- writes when the signed JWT contains app_metadata.role = 'admin'. Without this claim,
-- admin catalog photo uploads are rejected by row level security.
-- After running, the admin must sign out and back in so the new claim is in their token.
-- Replace the email below if the administrator account changes.
UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
WHERE email = 'brady743@gmail.com';
