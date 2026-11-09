// Database integration tests for checkout, order lifecycle, payments, refunds and inventory.
// They execute the real pending SQL migrations against a production-shaped Postgres fixture
// (supabase/tests/order_fixture.sql). Nothing here touches a Supabase project.
//
// Usage: ORDER_TEST_DATABASE_URL=postgres://... node src/services/orderIntegration.test.mjs
// WARNING: the target database's public and auth schemas are DROPPED and recreated. Use a scratch database.
// Without ORDER_TEST_DATABASE_URL the test is skipped locally, and fails when CI=true so it cannot silently pass.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const url = process.env.ORDER_TEST_DATABASE_URL;
if (!url) {
  if (process.env.CI === 'true') {
    console.error('ORDER_TEST_DATABASE_URL is required in CI.');
    process.exit(1);
  }
  console.log('Order integration tests skipped: set ORDER_TEST_DATABASE_URL to a scratch Postgres database.');
  process.exit(0);
}

const root = new URL('../../', import.meta.url);
const file = (p) => new URL(p, root).pathname;

function psql(args, input) {
  return spawnSync('psql', [url, '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', ...args], { input, encoding: 'utf8' });
}
function loadFile(path) {
  const r = psql(['-f', file(path)]);
  assert.equal(r.status, 0, `failed loading ${path}: ${r.stderr}`);
}

const asService = `SET ROLE service_role; SELECT set_config('request.jwt.claim.role','service_role',false);`;
const asAdmin = `SET ROLE authenticated; SELECT set_config('request.jwt.claim.role','authenticated',false); SELECT set_config('test.is_admin','true',false);`;
const asCustomer = `SET ROLE authenticated; SELECT set_config('request.jwt.claim.role','authenticated',false);`;

// Runs SQL as a role and returns { ok, out, err }. Output of SELECTs is the last line(s).
function run(prefix, sql) {
  const r = psql([], `${prefix}\n${sql}`);
  const lines = (r.stdout || '').trim().split('\n');
  return { ok: r.status === 0, out: lines[lines.length - 1] ?? '', err: r.stderr || '' };
}
function q(sql) {
  const r = psql(['-c', sql]);
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}

// Tests run strictly in order (later tests depend on earlier database state).
const tests = [];
function test(name, fn) { tests.push([name, fn]); }

// ---- setup -----------------------------------------------------------------
loadFile('supabase/tests/order_fixture.sql');
loadFile('supabase/pending_migrations/20261109090000_order_lifecycle_integrity.sql');
loadFile('supabase/pending_migrations/20261109090001_checkout_authoritative_ledger.sql');

const customer = randomUUID();
const otherCustomer = randomUUID();
const nursery = randomUUID();
const zone = randomUUID();
const prodUsd = randomUUID();   // USD 10.00, stock 5
const prodHnl = randomUUID();   // HNL 100.00, stock 3
const prodLast = randomUUID();  // USD 4.00, stock 1 (concurrency)
q(`INSERT INTO auth.users(id) VALUES ('${customer}'),('${otherCustomer}');
   INSERT INTO nurseries(id,name,is_active) VALUES ('${nursery}','Test Nursery',true);
   INSERT INTO delivery_zones(id,name,fee,currency,is_active) VALUES ('${zone}','Town',5,'USD',true);
   INSERT INTO exchange_rate_history(rate_date,usd_to_hnl) VALUES (current_date,25);
   INSERT INTO products(id,nursery_id,name,price,currency,stock_quantity,is_active) VALUES
     ('${prodUsd}','${nursery}','Palm',10,'USD',5,true),
     ('${prodHnl}','${nursery}','Fern',100,'HNL',3,true),
     ('${prodLast}','${nursery}','Last Orchid',4,'USD',1,true);`);

const stock = (id) => Number(q(`SELECT stock_quantity FROM products WHERE id='${id}'`));
const count = (table, where) => Number(q(`SELECT count(*) FROM ${table} WHERE ${where}`));

function checkout({ token = randomUUID(), cust = customer, currency = 'USD', zoneId = zone, items }) {
  const call = `SELECT public.create_marketplace_order('${token}','${cust}','Ana Perez','+504 9999 1111','${zoneId}','Sandy Bay','',` +
    `'${currency}',false,'${JSON.stringify(items)}'::jsonb)::text;`;
  const r = run(asService, call);
  return { token, ...r, json: r.ok ? JSON.parse(r.out) : null };
}
function advance(orderId, next, prefix = asAdmin) {
  return run(prefix, `SELECT public.advance_order_status('${orderId}','${next}','admin','Tester','note')::text;`);
}

console.log("Order integration tests");

// ---- checkout ---------------------------------------------------------------
let main;
test('checkout reserves stock and returns database-calculated totals', () => {
  main = checkout({ items: [{ product_id: prodUsd, quantity: 2 }, { product_id: prodHnl, quantity: 1 }] });
  assert.ok(main.ok, main.err);
  // USD checkout: 2 x 10 + (100 HNL / 25 = 4) + delivery 5 = 29
  assert.equal(main.json.duplicate, false);
  assert.equal(Number(main.json.subtotal), 24);
  assert.equal(Number(main.json.delivery_fee), 5);
  assert.equal(Number(main.json.total), 29);
  assert.equal(main.json.items.length, 2);
  assert.equal(stock(prodUsd), 3);
  assert.equal(stock(prodHnl), 2);
});

test('checkout writes initial history and a pending customer_order ledger entry exactly once', () => {
  const id = main.json.order_id;
  assert.equal(count('order_status_history', `order_id='${id}' AND new_status='order_placed'`), 1);
  assert.equal(count('transaction_records', `related_order_id='${id}' AND transaction_type='customer_order' AND status='pending'`), 1);
  assert.equal(q(`SELECT payment_status||'/'||canonical_status FROM orders WHERE id='${id}'`), 'pending/order_placed');
});

test('identical retry returns the original order without deducting stock or duplicating records', () => {
  const retry = checkout({ token: main.token, items: [{ product_id: prodUsd, quantity: 2 }, { product_id: prodHnl, quantity: 1 }] });
  assert.ok(retry.ok, retry.err);
  assert.equal(retry.json.duplicate, true);
  assert.equal(retry.json.order_id, main.json.order_id);
  assert.equal(Number(retry.json.total), 29);
  assert.equal(stock(prodUsd), 3);
  assert.equal(count('order_status_history', `order_id='${main.json.order_id}'`), 1);
  assert.equal(count('transaction_records', `related_order_id='${main.json.order_id}'`), 1);
});

test('a reused token with a different cart is rejected', () => {
  const r = checkout({ token: main.token, items: [{ product_id: prodUsd, quantity: 3 }] });
  assert.equal(r.ok, false);
  assert.match(r.err, /already used for a different cart/);
  assert.equal(stock(prodUsd), 3);
});

test('a token cannot be replayed by another customer', () => {
  const r = checkout({ token: main.token, cust: otherCustomer, items: [{ product_id: prodUsd, quantity: 2 }, { product_id: prodHnl, quantity: 1 }] });
  assert.equal(r.ok, false);
  assert.match(r.err, /does not belong to this customer/);
});

test('insufficient stock rolls back the whole order atomically', () => {
  const before = count('orders', 'true');
  const r = checkout({ items: [{ product_id: prodUsd, quantity: 1 }, { product_id: prodHnl, quantity: 99 }] });
  assert.equal(r.ok, false);
  assert.match(r.err, /Insufficient stock/);
  assert.equal(count('orders', 'true'), before);
  assert.equal(stock(prodUsd), 3, 'earlier line must not keep its reservation');
});

test('inactive products and invalid quantities are rejected', () => {
  q(`UPDATE products SET is_active=false WHERE id='${prodHnl}'`);
  assert.match(checkout({ items: [{ product_id: prodHnl, quantity: 1 }] }).err, /unavailable/);
  q(`UPDATE products SET is_active=true WHERE id='${prodHnl}'`);
  assert.match(checkout({ items: [{ product_id: prodUsd, quantity: 0 }] }).err, /Invalid product or quantity/);
});

test('concurrent checkouts cannot oversell the last unit', async () => {
  const launch = () => new Promise((resolve) => {
    const token = randomUUID();
    const child = spawn('psql', [url, '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => resolve({ ok: code === 0, err }));
    child.stdin.end(`${asService}\nSELECT public.create_marketplace_order('${token}','${customer}','Ana Perez','+504 9999 1111','${zone}','Sandy Bay','','USD',false,'[{"product_id":"${prodLast}","quantity":1}]'::jsonb);`);
  });
  return Promise.all([launch(), launch(), launch()]).then((results) => {
    assert.equal(results.filter((r) => r.ok).length, 1, 'exactly one buyer may win the last unit');
    assert.equal(stock(prodLast), 0);
    assert.equal(count('order_items', `product_id='${prodLast}'`), 1);
  });
});

// ---- lifecycle / payments ---------------------------------------------------
test('only admins or the service role may change status', () => {
  const r = advance(main.json.order_id, 'payment_pending', asCustomer);
  assert.equal(r.ok, false);
  assert.match(r.err, /Not authorized/);
});

test('an unpaid order cannot skip payment', () => {
  const r = advance(main.json.order_id, 'delivered');
  assert.equal(r.ok, false);
  assert.match(r.err, /Invalid order status transition/);
});

test('payment confirmation records one payment equal to the order total; retries do not duplicate', () => {
  const id = main.json.order_id;
  assert.ok(advance(id, 'payment_pending').ok);
  const paid = advance(id, 'payment_confirmed');
  assert.ok(paid.ok, paid.err);
  assert.equal(JSON.parse(paid.out).transaction_created, true);
  const again = advance(id, 'payment_confirmed');
  assert.equal(JSON.parse(again.out).changed, false);
  assert.equal(count('transaction_records', `related_order_id='${id}' AND transaction_type='customer_payment' AND amount=29 AND status='completed'`), 1);
  assert.equal(count('transaction_records', `related_order_id='${id}' AND transaction_type='customer_payment'`), 1);
  assert.equal(q(`SELECT payment_status FROM orders WHERE id='${id}'`), 'confirmed');
});

test('operational steps create no cash movements and delivery is timestamped', () => {
  const id = main.json.order_id;
  for (const s of ['order_processing', 'supplier_confirmed', 'preparing_order', 'ready_for_pickup', 'out_for_delivery', 'delivered', 'completed']) {
    const r = advance(id, s);
    assert.ok(r.ok, `${s}: ${r.err}`);
  }
  assert.equal(count('transaction_records', `related_order_id='${id}' AND transaction_type NOT IN ('customer_order','customer_payment')`), 0);
  assert.notEqual(q(`SELECT delivered_at FROM orders WHERE id='${id}'`), '');
  assert.equal(q(`SELECT status FROM orders WHERE id='${id}'`), 'completed');
});

test('a delivered order refund records one refund and does not return stock', () => {
  const id = main.json.order_id;
  const before = stock(prodUsd);
  assert.ok(advance(id, 'refund_requested').ok);
  assert.equal(q(`SELECT payment_status FROM orders WHERE id='${id}'`), 'refund_requested');
  assert.ok(advance(id, 'refunded').ok);
  assert.equal(count('transaction_records', `related_order_id='${id}' AND transaction_type='refund' AND amount=29 AND status='refunded'`), 1);
  assert.equal(q(`SELECT payment_status FROM orders WHERE id='${id}'`), 'refunded');
  assert.equal(stock(prodUsd), before);
  assert.equal(advance(id, 'payment_confirmed').ok, false, 'a refunded order cannot be paid again');
});

// ---- cancellation and inventory ----------------------------------------------
test('cancelling an unpaid order returns reserved stock once and closes its ledger entry', () => {
  const o = checkout({ items: [{ product_id: prodUsd, quantity: 2 }, { product_id: prodHnl, quantity: 1 }] });
  assert.ok(o.ok, o.err);
  const id = o.json.order_id;
  const usdBefore = stock(prodUsd); const hnlBefore = stock(prodHnl);
  const c = advance(id, 'cancelled');
  assert.ok(c.ok, c.err);
  assert.equal(stock(prodUsd), usdBefore + 2);
  assert.equal(stock(prodHnl), hnlBefore + 1);
  assert.equal(count('transaction_records', `related_order_id='${id}' AND transaction_type='customer_order' AND status='cancelled'`), 1);
  assert.equal(count('transaction_records', `related_order_id='${id}' AND transaction_type='cancellation' AND amount=0`), 1);
  // Retrying the cancellation must not restore stock a second time.
  assert.equal(JSON.parse(advance(id, 'cancelled').out).changed, false);
  assert.equal(stock(prodUsd), usdBefore + 2);
  // Unpaid cancelled orders cannot be refunded.
  assert.equal(advance(id, 'refund_requested').ok, false);
  assert.equal(q(`SELECT status FROM orders WHERE id='${id}'`), 'cancelled');
});

test('cancelling a paid order returns stock and allows exactly one refund', () => {
  const o = checkout({ items: [{ product_id: prodUsd, quantity: 1 }] });
  const id = o.json.order_id;
  const before = stock(prodUsd);
  assert.ok(advance(id, 'payment_confirmed').ok);
  assert.ok(advance(id, 'cancelled').ok);
  assert.equal(stock(prodUsd), before + 1);
  assert.ok(advance(id, 'refund_requested').ok);
  assert.ok(advance(id, 'refunded').ok);
  assert.equal(count('transaction_records', `related_order_id='${id}' AND transaction_type='refund'`), 1);
  assert.equal(stock(prodUsd), before + 1, 'refund after cancellation must not restore stock twice');
});

test('inventory never goes negative or exceeds the reserve-and-return balance', () => {
  assert.equal(count('products', 'stock_quantity < 0'), 0);
  // Every unit is either on the shelf or held by an order that was never cancelled
  // (cancelled orders returned their stock, even if they later moved to a refund state).
  const rows = q(`SELECT p.name||':'||(p.stock_quantity + coalesce(sum(oi.quantity) FILTER (WHERE NOT EXISTS (SELECT 1 FROM order_status_history h WHERE h.order_id = o.id AND h.new_status = 'cancelled')),0))
                  FROM products p LEFT JOIN order_items oi ON oi.product_id=p.id LEFT JOIN orders o ON o.id=oi.order_id
                  GROUP BY p.id, p.name ORDER BY p.name`).split('\n');
  assert.deepEqual(rows, ['Fern:3', 'Last Orchid:1', 'Palm:5']);
});

let passed = 0;
for (const [name, fn] of tests) {
  try { await fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`  FAIL ${name}\n${e.stack}`); process.exitCode = 1; }
}
console.log(process.exitCode ? `Order integration tests FAILED (${passed}/${tests.length} passed).` : `Order integration tests passed (${passed}/${tests.length}).`);
