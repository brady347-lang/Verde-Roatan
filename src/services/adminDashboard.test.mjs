import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const api = read('./api.ts');
const app = read('../App.tsx');
const account = read('../screens/AccountScreen.tsx');
const commandCenter = read('../components/AdminOrderCommandCenter.tsx');
const migration = read('../../supabase/migrations/20261109110000_admin_command_center_read_access.sql');

assert.match(api, /fetchAdminOrders\(token: string, strictRelatedReads = true\)/);
assert.match(api, /if \(strictRelatedReads\) throw error/);
assert.match(api, /return fetchAdminOrders\(token, false\)/);
assert.match(api, /export async function fetchAdminSupplierPurchaseRequests/);
assert.match(api, /export async function fetchAdminNotifications/);
assert.match(app, /fetchAdminSupplierPurchaseRequests\(session\.access_token\)/);
assert.match(app, /fetchAdminNotifications\(session\.access_token\)/);
assert.match(app, /Promise\.all\(\[/);
assert.match(app, /setAdminSyncStatus\('error'\)/);
assert.match(account, /dataSyncStatus=\{adminSyncStatus\}/);
assert.match(commandCenter, /Dashboard data is not fully synchronized/);
for (const policy of ['Admins manage orders', 'Admins read order items', 'Admins read order status history', 'Admins manage order messages', 'Admins manage supplier purchase requests', 'Admins read transaction records', 'Admins manage notification events']) {
  assert.ok(migration.includes(policy), `missing RLS policy: ${policy}`);
}
assert.match(migration, /public\.is_app_admin\(\)/);
assert.match(migration, /GRANT SELECT ON public\.transaction_records TO authenticated/);
console.log('adminDashboard tests passed');
