-- Publish only supplier products that have passed both administrator review gates.
-- Existing active rows that are still pending/rejected/suspended are made inactive before
-- validating the approval guard. Product approval is the publication decision; supplier
-- directory activation remains a separate concern and does not hide an approved listing.

update public.products
set is_active = false,
    updated_at = now()
where is_active = true
  and (
    listing_status is distinct from 'approved'
    or image_review_status is distinct from 'approved'
  );

alter table public.products
  validate constraint products_active_requires_approval;

-- Remove the older permissive policy that exposed every active row, including pending
-- supplier submissions. Keep the public catalog limited to active, approved listings.
drop policy if exists "Public can view active products" on public.products;
drop policy if exists "Public read active products" on public.products;

create policy "Public read approved active products"
on public.products
for select
to anon, authenticated
using (
  is_active = true
  and listing_status = 'approved'
  and image_review_status = 'approved'
);

comment on policy "Public read approved active products" on public.products is
  'Customers can only read active supplier listings after both listing and image approval.';
