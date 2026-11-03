# Separate identification-review database setup

This folder is for the separate Supabase project named **Verde Roatan DB** only.

- Expected project ref: `moaqgqbqfeckeabigfha`
- Project URL: `https://moaqgqbqfeckeabigfha.supabase.co`
- Do not run this SQL against the established production catalog/orders project.

## Setup

1. Open the **Verde Roatan DB** project in Supabase.
2. Confirm its project ref is exactly `moaqgqbqfeckeabigfha`.
3. Open SQL Editor and review `identification_review_schema.sql`.
4. Run that SQL only in this separate project.
5. Confirm the private `identification-review-images` bucket exists and is not public.
6. In Cloudflare, open the existing **Verde Roatan Gemini Worker** and add these variables/secrets:

| Name | Type | Value |
|---|---|---|
| `PRIMARY_SUPABASE_URL` | Variable | Existing production project URL |
| `PRIMARY_SUPABASE_ANON_KEY` | Secret | Existing project's public anon/publishable key |
| `REVIEW_SUPABASE_URL` | Variable | `https://moaqgqbqfeckeabigfha.supabase.co` |
| `REVIEW_SUPABASE_SERVICE_ROLE_KEY` | Secret | Service-role key from the separate Verde Roatan DB project |

Never put either service-role key in the app, GitHub source, or a message. Add it only in Cloudflare Worker secrets.
7. In the primary Supabase project's Auth user metadata, ensure administrators have a trusted `app_metadata.role = admin` claim. This must be set through a secure admin/server process, not by the user-editable profile metadata.
8. Deploy the updated Gemini Worker only after reviewing the code and setting all four variables/secrets.

## Authentication and data flow

- The customer signs in using the existing app / primary Supabase project.
- The app sends that session token to the Gemini Worker.
- The Worker verifies the token against the primary project's Auth endpoint.
- The Worker uploads the specimen photo to the separate project's private storage bucket and writes the review and confirmation records using the separate project's service-role key.
- The separate project's service-role key never leaves Cloudflare.
- The Worker admin-review endpoint checks the verified primary user's trusted `app_metadata.role = admin` claim before changing a review status.

## Security behavior

- Direct `anon` and `authenticated` access to review tables is denied by RLS; the verified Worker is the only application gateway.
- Customer submissions are stored as `pending`; customers cannot approve their own records.
- A customer confirmation is evidence, not an admin approval or a trusted botanical reference.
- Corrections are stored separately from the AI identification so later review can compare both.
- Approved records still require a deliberate future process before they are used as training/reference data.
- This schema does not alter products, inventory, orders, the existing catalog, or the established production database.

## Current implementation status

- [x] Customer confirmation/correction UI in the app source.
- [x] Worker route to verify primary-project sessions and save review records/photos in the separate project.
- [x] Worker route to approve/reject a review for verified admins.
- [ ] Run the SQL in the separate project.
- [ ] Add the four Cloudflare variables/secrets and deploy the updated Worker.
- [ ] Build and test with a customer account and an admin account.
- [ ] Add the admin review queue UI.

Until the SQL and Worker setup steps are completed, the app will show a clear configuration error instead of pretending feedback was saved.
