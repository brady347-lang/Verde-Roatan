# Separate identification-review database setup

This folder is for the separate Supabase project named **Verde Roatan DB** only.

- Expected project ref: `moaqgqbqfeckeabigfha`
- Project URL: `https://moaqgqbqfeckeabigfha.supabase.co`
- Do not run this SQL against the established production catalog/orders project.

## Manual setup required

1. Open the **Verde Roatan DB** project in Supabase.
2. Confirm its project ref is exactly `moaqgqbqfeckeabigfha`.
3. Open SQL Editor and review `identification_review_schema.sql`.
4. Run that SQL only in this separate project.
5. In Authentication, ensure customer sign-in is enabled. The current schema requires an authenticated user to submit a review or confirmation.
6. For the administrator account, set the trusted `app_metadata.role` value to `admin` using a secure server-side/admin process. Do not let users set this field themselves.
7. Verify the private `identification-review-images` bucket exists and is not public.
8. Test with two accounts: a normal customer must only see their own review and confirmation; an admin must be able to review and update all submissions.

## Security behavior

- Customer submissions are always created as `pending`; customers cannot approve or reject their own records.
- Each customer can upload and read only objects under their own user-ID folder.
- Only users with trusted `app_metadata.role = admin` can approve/reject submissions or manage other users' records.
- Customer confirmation is recorded separately from admin approval. A customer confirmation alone does not create a trusted botanical reference.
- This schema does not alter products, inventory, orders, the existing catalog, or the established production database.

## Not yet connected to the app

This is a reviewed schema draft only. It has **not** been run against Supabase and the app UI/API for submitting, confirming, and administering these records is not yet complete. Do not treat the identification-review workflow as live until both the SQL and app integration have been tested.
