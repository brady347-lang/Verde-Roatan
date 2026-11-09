import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../supabase/migrations/20261109090000_order_lifecycle_integrity.sql', import.meta.url), 'utf8');

assert.match(app, /p_order_id:\s*orderForSync\.id\s*,/, 'order status RPC must receive the UUID primary key');
assert.doesNotMatch(app, /p_order_id:\s*orderForSync\.order_id\s*,/, 'human-readable order numbers must never be passed to the UUID RPC');
assert.match(app, /order_placed:\s*'payment_pending'/, 'default progression must not mark an unpaid order as paid');
assert.match(app, /currentCanonical === 'order_placed'\) nextCanonical = 'payment_pending'/, 'local status projection must match the server progression');
assert.match(app, /nextCanonical === 'refund_requested' \? 'refund_requested'/, 'refund requests must be reflected in the local payment state');
assert.match(app, /nextCanonical === 'refunded' \? 'refunded'/, 'completed refunds must be reflected in the local payment state');
assert.match(app, /\['payment_confirmed', 'cancelled', 'refunded'\]\.includes\(nextCanonical\)/, 'operational statuses must not create financial transactions');
assert.match(app, /amount:\s*nextCanonical === 'cancelled' \? 0 : target\.total/, 'cancellations must not be reported as cash receipts');

assert.match(migration, /SECURITY DEFINER/, 'the status RPC must remain privileged');
assert.match(migration, /public\.is_app_admin\(\) OR auth\.role\(\) = 'service_role'/, 'the RPC must enforce admin/service authorization');
assert.match(migration, /FOR UPDATE/, 'order row must be locked while changing status');
assert.match(migration, /IF v_current = p_next_status THEN/, 'retries of the same status must be idempotent');
assert.match(migration, /Invalid order status transition/, 'invalid state transitions must be rejected');
assert.match(migration, /Only a confirmed payment can be sent for refund/, 'refunds must require a confirmed payment');
assert.match(migration, /A refund must be requested before it can be recorded as refunded/, 'refund completion must follow a request');
assert.match(migration, /WHEN p_next_status = 'refund_requested' THEN 'refund_requested'/, 'refund request must update payment status');
assert.match(migration, /WHEN p_next_status = 'refunded' THEN 'refunded'/, 'refund completion must update payment status');
assert.match(migration, /tr\.transaction_type = v_transaction_type/, 'the financial ledger must avoid duplicate order event entries');
assert.match(migration, /v_transaction_amount := 0/, 'cancellation must be recorded as an audit event, not a cash movement');

console.log('Order lifecycle and financial-ledger regression checks passed.');
