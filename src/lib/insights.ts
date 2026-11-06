import { ActiveOrder } from '../types';

/** Pure number-crunching for the admin Insights charts (kept separate so it is easy to test). */
export interface DayPoint { label: string; usd: number; orders: number }
export interface CountRow { key: string; label: string; value: number }

const EXCLUDED = new Set(['cancelled', 'refunded', 'refund_requested']);
const isCounted = (o: ActiveOrder) => !EXCLUDED.has(String(o.canonical_status || ''));

export function orderUsd(o: ActiveOrder, fallbackRate: number): number {
  const total = Number(o.total) || 0;
  if (o.currency === 'USD') return total;
  const rate = Number(o.exchange_rate_used) > 0 ? Number(o.exchange_rate_used) : fallbackRate;
  return rate > 0 ? total / rate : 0;
}

export function salesByDay(orders: ActiveOrder[], days: number, fallbackRate: number, now = new Date()): DayPoint[] {
  const points: DayPoint[] = [];
  const index = new Map<string, DayPoint>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const point = { label: `${d.getMonth() + 1}/${d.getDate()}`, usd: 0, orders: 0 };
    points.push(point); index.set(key, point);
  }
  for (const o of orders) {
    if (!isCounted(o)) continue;
    const d = new Date(o.created_at);
    if (Number.isNaN(d.getTime())) continue;
    const point = index.get(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    if (point) { point.usd += orderUsd(o, fallbackRate); point.orders += 1; }
  }
  return points.map((p) => ({ ...p, usd: Math.round(p.usd * 100) / 100 }));
}

export function ordersByStatus(orders: ActiveOrder[]): CountRow[] {
  const counts = new Map<string, number>();
  for (const o of orders) {
    const key = String(o.canonical_status || o.status || 'unknown');
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts].map(([key, value]) => ({ key, label: key.replace(/_/g, ' '), value })).sort((a, b) => b.value - a.value);
}

export function topProducts(orders: ActiveOrder[], limit = 5): CountRow[] {
  const counts = new Map<string, number>();
  for (const o of orders) {
    if (!isCounted(o)) continue;
    for (const item of o.items || []) counts.set(item.name, (counts.get(item.name) || 0) + (Number(item.qty) || 0));
  }
  return [...counts].map(([key, value]) => ({ key, label: key, value })).sort((a, b) => b.value - a.value).slice(0, limit);
}

export function totals(orders: ActiveOrder[], fallbackRate: number) {
  const counted = orders.filter(isCounted);
  const revenue = counted.reduce((sum, o) => sum + orderUsd(o, fallbackRate), 0);
  return {
    orders: orders.length,
    revenueUsd: Math.round(revenue * 100) / 100,
    averageUsd: counted.length ? Math.round((revenue / counted.length) * 100) / 100 : 0,
    open: orders.filter((o) => !['delivered', 'completed', 'cancelled', 'refunded'].includes(String(o.canonical_status || ''))).length
  };
}
