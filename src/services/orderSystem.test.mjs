import assert from 'node:assert/strict';
import { loadSavedOrders, saveOrders, loadSavedTransactions, saveTransactions, loadSavedSupplierRequests, saveSupplierRequests } from './orderSystem.ts';

const values = new Map();
globalThis.localStorage = {
  getItem: key => values.has(key) ? values.get(key) : null,
  setItem: (key, value) => values.set(key, value),
  removeItem: key => values.delete(key)
};

localStorage.setItem('verde_auth_session', JSON.stringify({ user: { id: 'customer-one' } }));
saveOrders([{ id: 'order-one' }]);
saveTransactions([{ id: 'transaction-one' }]);
saveSupplierRequests([{ id: 'request-one' }]);

localStorage.setItem('verde_auth_session', JSON.stringify({ user: { id: 'customer-two' } }));
assert.deepEqual(loadSavedOrders(), [], 'customer two must not see customer one cached orders');
assert.deepEqual(loadSavedTransactions(), [], 'customer two must not see customer one cached financial records');
assert.deepEqual(loadSavedSupplierRequests(), [], 'customer two must not see customer one cached supplier requests');

saveOrders([{ id: 'order-two' }]);
localStorage.setItem('verde_auth_session', JSON.stringify({ user: { id: 'customer-one' } }));
assert.deepEqual(loadSavedOrders(), [{ id: 'order-one' }], 'customer one cache remains isolated and recoverable');
assert.deepEqual(loadSavedTransactions(), [{ id: 'transaction-one' }]);
assert.deepEqual(loadSavedSupplierRequests(), [{ id: 'request-one' }]);

localStorage.setItem('verde_auth_session', JSON.stringify({ user: { id: 'customer-two' } }));
assert.deepEqual(loadSavedOrders(), [{ id: 'order-two' }]);

// Unscoped legacy cache data must never be read by the new account-scoped helpers.
localStorage.setItem('verde_orders_v2', JSON.stringify([{ id: 'legacy-order' }]));
assert.deepEqual(loadSavedOrders(), [{ id: 'order-two' }]);
console.log('Account-scoped order and finance cache tests passed.');
