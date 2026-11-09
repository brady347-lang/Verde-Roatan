import React, { useState } from 'react';
import {
  AlertCircle,
  Archive,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  DollarSign,
  Download,
  Edit2,
  Eye,
  FileText,
  Filter,
  Layers,
  MessageSquare,
  PackageCheck,
  Palmtree,
  Plus,
  RefreshCw,
  Search,
  Send,
  Shield,
  Trash2,
  Truck,
  User,
  Users,
  X
} from 'lucide-react';
import {
  ActiveOrder,
  CanonicalOrderStatus,
  Language,
  NotificationEvent,
  OrderMessage,
  OrderStatusHistoryEntry,
  RegisteredSupplier,
  SupplierPurchaseRequest,
  TransactionRecord,
  TransactionType
} from '../types';
import { ORDER_LIFECYCLE_STATUS_LABELS } from '../services/orderSystem';

interface AdminOrderCommandCenterProps {
  lang: Language;
  orders: ActiveOrder[];
  onUpdateOrder: (order: ActiveOrder) => void;
  onAdvanceOrderStatus: (orderId: string, nextStatus: CanonicalOrderStatus, notes?: string) => void;
  transactions: TransactionRecord[];
  onAddTransaction: (txn: TransactionRecord) => void;
  supplierRequests: SupplierPurchaseRequest[];
  onUpdateSupplierRequest: (req: SupplierPurchaseRequest) => void;
  notifications: NotificationEvent[];
  onMarkNotificationRead: (id: string) => void;
  onMarkAllNotificationsRead: () => void;
  suppliers: RegisteredSupplier[];
  formatMoney: (val: number, cur: string) => React.ReactNode;
  exchangeRateHnl: number;
  dataSyncStatus: 'idle' | 'loading' | 'ready' | 'error';
  dataSyncError: string;
}

export const AdminOrderCommandCenter: React.FC<AdminOrderCommandCenterProps> = ({
  lang,
  orders,
  onUpdateOrder,
  onAdvanceOrderStatus,
  transactions,
  onAddTransaction,
  supplierRequests,
  onUpdateSupplierRequest,
  notifications,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  suppliers,
  formatMoney,
  exchangeRateHnl,
  dataSyncStatus,
  dataSyncError
}) => {
  // Command Center Navigation Tabs
  const [activeTab, setActiveTab] = useState<'orders' | 'transactions' | 'notifications' | 'reports'>('orders');

  // Search & Filter state for Orders
  const [orderSearch, setOrderSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [supplierFilter, setSupplierFilter] = useState<string>('all');

  // Selected Order for Full Modal Inspection & Workflow
  const [inspectingOrderId, setInspectingOrderId] = useState<string | null>(null);
  const [statusChangeNotes, setStatusChangeNotes] = useState('');
  const [selectedNextStatus, setSelectedNextStatus] = useState<CanonicalOrderStatus>('order_processing');
  const [adminChatMsg, setAdminChatMsg] = useState('');
  const [adminChatRecipient, setAdminChatRecipient] = useState<'customer' | 'supplier' | 'all'>('customer');

  // Filtered Orders
  const filteredOrders = orders.filter((o) => {
    if (orderSearch.trim()) {
      const q = orderSearch.toLowerCase();
      const matchId = o.order_id.toLowerCase().includes(q);
      const matchCustomer = o.customer_name.toLowerCase().includes(q);
      const matchPhone = o.phone.toLowerCase().includes(q);
      if (!matchId && !matchCustomer && !matchPhone) return false;
    }
    if (statusFilter !== 'all') {
      const canonical = o.canonical_status || (o.status as any);
      if (canonical !== statusFilter) return false;
    }
    if (paymentFilter !== 'all') {
      if ((o.payment_status || 'pending') !== paymentFilter) return false;
    }
    if (supplierFilter !== 'all') {
      if (o.assigned_supplier_id !== supplierFilter) return false;
    }
    return true;
  });

  const inspectedOrder = orders.find((o) => o.id === inspectingOrderId || o.order_id === inspectingOrderId);

  // Status Change Execution
  const handleExecuteStatusChange = () => {
    if (!inspectedOrder) return;
    onAdvanceOrderStatus(inspectedOrder.id, selectedNextStatus, statusChangeNotes);
    setStatusChangeNotes('');
  };

  // Assign Supplier Action
  const handleAssignSupplier = (supplierId: string) => {
    if (!inspectedOrder) return;
    const sup = suppliers.find((s) => s.id === supplierId);
    if (!sup) return;

    const updated: ActiveOrder = {
      ...inspectedOrder,
      assigned_supplier_id: sup.id,
      assigned_supplier_name: `${sup.name} (${sup.location})`,
      canonical_status: 'supplier_confirmation_required'
    };
    onUpdateOrder(updated);

    // Create corresponding supplier purchase request if not already present
    const existingReq = supplierRequests.find((r) => r.order_id === inspectedOrder.order_id);
    if (!existingReq) {
      const newReq: SupplierPurchaseRequest = {
        id: `spr-${Date.now()}`,
        order_id: inspectedOrder.order_id,
        supplier_id: sup.id,
        supplier_name: sup.name,
        supplier_location: sup.location,
        created_at: new Date().toISOString(),
        items: inspectedOrder.items.map((it) => ({
          id: `spri-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          product_id: it.id,
          name: it.name,
          quantity: it.qty,
          unit_price: Math.round(it.price * 0.65), // Standard wholesale base
          currency: it.currency,
          status: 'pending'
        })),
        status: 'pending_confirmation',
        total_supplier_cost: Math.round(inspectedOrder.subtotal * 0.65),
        currency: inspectedOrder.currency,
        payment_status: 'unpaid'
      };
      onUpdateSupplierRequest(newReq);
    }
  };

  // Send In-Order Message
  const handleSendAdminMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminChatMsg.trim() || !inspectedOrder) return;

    const newMsg: OrderMessage = {
      id: `msg-${Date.now()}`,
      order_id: inspectedOrder.order_id,
      sender_role: 'admin',
      sender_name: 'Verde Operations (Admin)',
      recipient_role: adminChatRecipient,
      supplier_id: inspectedOrder.assigned_supplier_id,
      message: adminChatMsg.trim(),
      timestamp: new Date().toISOString()
    };

    const updated: ActiveOrder = {
      ...inspectedOrder,
      messages: [...(inspectedOrder.messages || []), newMsg]
    };
    onUpdateOrder(updated);
    setAdminChatMsg('');
  };

  // Financial Reporting Calculations
  const totalSales = orders.reduce((sum, o) => sum + (o.currency === 'USD' ? o.total * exchangeRateHnl : o.total), 0);
  const totalCustomerPayments = orders
    .filter((o) => o.payment_status === 'confirmed')
    .reduce((sum, o) => sum + (o.currency === 'USD' ? o.total * exchangeRateHnl : o.total), 0);
  const outstandingCustomerBalances = orders
    .filter((o) => o.payment_status === 'pending')
    .reduce((sum, o) => sum + (o.currency === 'USD' ? o.total * exchangeRateHnl : o.total), 0);
  const totalSupplierPurchases = supplierRequests.reduce(
    (sum, r) => sum + (r.currency === 'USD' ? r.total_supplier_cost * exchangeRateHnl : r.total_supplier_cost),
    0
  );
  const supplierPaymentObligations = supplierRequests
    .filter((r) => r.payment_status === 'unpaid')
    .reduce((sum, r) => sum + (r.currency === 'USD' ? r.total_supplier_cost * exchangeRateHnl : r.total_supplier_cost), 0);
  const estimatedGrossProfit = totalSales - totalSupplierPurchases;

  const unreadNotifsCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="flex flex-col gap-4">
      {dataSyncStatus === 'loading' && (
        <div role="status" className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-[11px] text-[var(--ink-soft)]">
          Synchronizing orders, supplier requests, financial records, and notifications with Supabase…
        </div>
      )}
      {dataSyncStatus === 'ready' && (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-800">
          Live administrator data synchronized with Supabase.
        </div>
      )}
      {dataSyncStatus === 'error' && (
        <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
          <b>Dashboard data is not fully synchronized.</b> Cached information may be stale; do not use it as the current operational record until synchronization succeeds.
          <p className="mt-1 break-words">{dataSyncError}</p>
        </div>
      )}
      {/* Central Command Header */}
      <div className="bg-[var(--surface-2)] border border-[var(--line)] rounded-3xl p-4 flex flex-col gap-3 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-10 h-10 rounded-2xl bg-[var(--palm)]/15 text-[var(--palm)] flex items-center justify-center">
              <Shield className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-[17px] font-extrabold text-[var(--ink)]">
                {lang === 'es' ? 'Centro de Mando de Pedidos y Transacciones' : 'Order & Transaction Command Center'}
              </h2>
              <p className="text-[11.5px] text-[var(--ink-soft)]">
                {lang === 'es'
                  ? 'Supervisión integral de clientes, viveros proveedores y ledger financiero'
                  : 'Centralized oversight of orders, supplier fulfillment, and audit trail'}
              </p>
            </div>
          </div>
        </div>

        {/* Command Navigation Pills */}
        <div className="grid grid-cols-4 gap-1.5 pt-1">
          <button
            type="button"
            onClick={() => setActiveTab('orders')}
            className={`py-2 px-2 rounded-xl text-[12px] font-extrabold transition-all flex items-center justify-center gap-1 ${
              activeTab === 'orders'
                ? 'bg-[var(--palm)] text-white shadow-xs'
                : 'bg-[var(--surface)] text-[var(--ink-soft)] hover:text-[var(--ink)]'
            }`}
          >
            <Truck className="w-3.5 h-3.5" />
            Orders ({orders.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('transactions')}
            className={`py-2 px-2 rounded-xl text-[12px] font-extrabold transition-all flex items-center justify-center gap-1 ${
              activeTab === 'transactions'
                ? 'bg-[var(--palm)] text-white shadow-xs'
                : 'bg-[var(--surface)] text-[var(--ink-soft)] hover:text-[var(--ink)]'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            Ledger ({transactions.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('notifications')}
            className={`py-2 px-2 rounded-xl text-[12px] font-extrabold transition-all flex items-center justify-center gap-1 relative ${
              activeTab === 'notifications'
                ? 'bg-[var(--palm)] text-white shadow-xs'
                : 'bg-[var(--surface)] text-[var(--ink-soft)] hover:text-[var(--ink)]'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            Events
            {unreadNotifsCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center ml-0.5">
                {unreadNotifsCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('reports')}
            className={`py-2 px-2 rounded-xl text-[12px] font-extrabold transition-all flex items-center justify-center gap-1 ${
              activeTab === 'reports'
                ? 'bg-[var(--palm)] text-white shadow-xs'
                : 'bg-[var(--surface)] text-[var(--ink-soft)] hover:text-[var(--ink)]'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            Finance
          </button>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 1. ORDERS DASHBOARD & FILTER ENGINE                           */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'orders' && (
        <div className="flex flex-col gap-3">
          {/* Search & Filter Toolbar */}
          <div className="bg-[var(--surface)] border border-[var(--line)] rounded-2xl p-3 flex flex-col gap-2.5">
            <div className="relative">
              <Search className="w-4 h-4 text-[var(--ink-soft)] absolute left-3 top-2.5" />
              <input
                type="text"
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
                placeholder="Search by order # (ROA-...), customer, or phone…"
                className="w-full bg-[var(--surface-2)] border border-[var(--line)] rounded-xl pl-9 pr-3 py-1.5 text-[12.5px] focus:outline-none focus:border-[var(--palm)]"
              />
            </div>

            <div className="grid grid-cols-3 gap-1.5 text-[11px]">
              {/* Lifecycle Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-[var(--surface-2)] border border-[var(--line)] rounded-lg p-1.5 font-bold"
              >
                <option value="all">All Statuses (14 Stages)</option>
                {Object.keys(ORDER_LIFECYCLE_STATUS_LABELS).map((st) => (
                  <option key={st} value={st}>
                    {ORDER_LIFECYCLE_STATUS_LABELS[st as CanonicalOrderStatus].en}
                  </option>
                ))}
              </select>

              {/* Payment Filter */}
              <select
                value={paymentFilter}
                onChange={(e) => setPaymentFilter(e.target.value)}
                className="bg-[var(--surface-2)] border border-[var(--line)] rounded-lg p-1.5 font-bold"
              >
                <option value="all">All Payments</option>
                <option value="confirmed">Confirmed</option>
                <option value="pending">Pending</option>
                <option value="refund_requested">Refund Req.</option>
                <option value="refunded">Refunded</option>
              </select>

              {/* Supplier Filter */}
              <select
                value={supplierFilter}
                onChange={(e) => setSupplierFilter(e.target.value)}
                className="bg-[var(--surface-2)] border border-[var(--line)] rounded-lg p-1.5 font-bold"
              >
                <option value="all">All Suppliers</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Orders List */}
          {filteredOrders.length === 0 ? (
            <div className="bg-[var(--surface)] border border-[var(--line)] rounded-2xl p-6 text-center text-[var(--ink-soft)] text-[13px]">
              No matching orders found.
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {filteredOrders.map((ord) => {
                const canonical = (ord.canonical_status || ord.status) as CanonicalOrderStatus;
                const statusMeta = ORDER_LIFECYCLE_STATUS_LABELS[canonical] || ORDER_LIFECYCLE_STATUS_LABELS.order_placed;

                return (
                  <div
                    key={ord.id}
                    onClick={() => setInspectingOrderId(ord.id)}
                    className="bg-[var(--surface)] border border-[var(--line)] hover:border-[var(--palm)]/60 rounded-2xl p-3.5 flex flex-col gap-2 cursor-pointer shadow-xs transition-all active:scale-[0.99]"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[13.5px] font-extrabold text-[var(--ink)]">
                          {ord.order_id}
                        </span>
                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${statusMeta.color}`}>
                          Step {statusMeta.step}: {statusMeta.en}
                        </span>
                      </div>
                      <b className="text-[13.5px] font-extrabold text-[var(--palm)]">
                        {formatMoney(ord.total, ord.currency)}
                      </b>
                    </div>

                    <div className="flex items-center justify-between text-[12px] text-[var(--ink-soft)]">
                      <span className="text-[var(--ink)] font-bold">
                        👤 {ord.customer_name} ({ord.phone})
                      </span>
                      <span>📍 {ord.zone_name}</span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] pt-1 border-t border-[var(--line)]">
                      <span className="text-[var(--ink-soft)] truncate max-w-[200px]">
                        🌿 {ord.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}
                      </span>
                      <span className="font-bold text-[var(--palm)] flex items-center gap-0.5">
                        Inspect & Manage <ChevronRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 2. TRANSACTION AUDIT LEDGER                                   */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'transactions' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-extrabold uppercase text-[var(--ink-soft)]">
              Permanent Financial & Audit Trail ({transactions.length})
            </span>
            <small className="text-[10.5px] text-[var(--ink-soft)]">
              Audited conversions at historical BCH rates
            </small>
          </div>

          <div className="flex flex-col gap-2">
            {transactions.map((txn) => {
              const isPositive = txn.type === 'customer_payment' || txn.type === 'customer_order' || txn.type === 'deposit';
              return (
                <div
                  key={txn.id}
                  className="bg-[var(--surface)] border border-[var(--line)] rounded-2xl p-3 flex flex-col gap-1.5 shadow-xs"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[12px] font-bold text-[var(--ink)]">
                        {txn.id}
                      </span>
                      <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[var(--ink-soft)] uppercase">
                        {txn.type.replace('_', ' ')}
                      </span>
                    </div>
                    <b className={`font-mono text-[13px] font-extrabold ${isPositive ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {isPositive ? '+' : '-'}{formatMoney(txn.amount, txn.currency)}
                    </b>
                  </div>

                  <p className="text-[11.5px] text-[var(--ink)]">{txn.notes}</p>

                  <div className="flex items-center justify-between text-[10.5px] text-[var(--ink-soft)] border-t border-[var(--line)] pt-1">
                    <span>Ref: #{txn.related_order_id} • Rate: {txn.exchange_rate} HNL/$</span>
                    <span>{new Date(txn.timestamp).toLocaleString()}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 3. CENTRALIZED NOTIFICATION CENTER                            */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'notifications' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-extrabold uppercase text-[var(--ink-soft)]">
              Centralized Operational Events
            </span>
            {unreadNotifsCount > 0 && (
              <button
                type="button"
                onClick={onMarkAllNotificationsRead}
                className="text-[11px] font-bold text-[var(--palm)] hover:underline"
              >
                Mark all as read
              </button>
            )}
          </div>

          <div className="flex flex-col gap-2">
            {notifications.map((n) => (
              <div
                key={n.id}
                onClick={() => {
                  onMarkNotificationRead(n.id);
                  if (n.related_order_id) setInspectingOrderId(n.related_order_id);
                }}
                className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                  !n.is_read
                    ? 'bg-[var(--surface)] border-[var(--palm)] shadow-xs'
                    : 'bg-[var(--surface-2)] border-[var(--line)] opacity-80'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-[var(--surface-2)] uppercase text-[var(--palm)]">
                      {n.category}
                    </span>
                    <b className="text-[12.5px] text-[var(--ink)]">{n.title}</b>
                  </div>
                  {!n.is_read && <span className="w-2 h-2 rounded-full bg-rose-500" />}
                </div>
                <p className="text-[11.5px] text-[var(--ink-soft)] mt-1">{n.description}</p>
                <small className="text-[10px] text-[var(--ink-soft)] block mt-1">
                  {new Date(n.timestamp).toLocaleTimeString()} · Entity: {n.entity_name}
                </small>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 4. FINANCIAL REPORTING                                        */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'reports' && (
        <div className="flex flex-col gap-3.5">
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-[var(--surface)] border border-[var(--line)] rounded-2xl p-3 flex flex-col gap-1 shadow-xs">
              <span className="text-[11px] font-extrabold uppercase text-[var(--ink-soft)]">
                Gross Sales (L)
              </span>
              <b className="text-[18px] font-extrabold text-[var(--ink)]">
                L {totalSales.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </b>
              <small className="text-[10.5px] text-emerald-600 font-bold">
                ≈ ${(totalSales / exchangeRateHnl).toFixed(2)} USD
              </small>
            </div>

            <div className="bg-[var(--surface)] border border-[var(--line)] rounded-2xl p-3 flex flex-col gap-1 shadow-xs">
              <span className="text-[11px] font-extrabold uppercase text-[var(--ink-soft)]">
                Customer Collections
              </span>
              <b className="text-[18px] font-extrabold text-emerald-600">
                L {totalCustomerPayments.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </b>
              <small className="text-[10.5px] text-[var(--ink-soft)]">
                Pending: L {outstandingCustomerBalances.toFixed(2)}
              </small>
            </div>

            <div className="bg-[var(--surface)] border border-[var(--line)] rounded-2xl p-3 flex flex-col gap-1 shadow-xs">
              <span className="text-[11px] font-extrabold uppercase text-[var(--ink-soft)]">
                Supplier Purchases
              </span>
              <b className="text-[18px] font-extrabold text-amber-600">
                L {totalSupplierPurchases.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </b>
              <small className="text-[10.5px] text-[var(--ink-soft)]">
                Unpaid to growers: L {supplierPaymentObligations.toFixed(2)}
              </small>
            </div>

            <div className="bg-[var(--surface)] border border-[var(--line)] rounded-2xl p-3 flex flex-col gap-1 shadow-xs">
              <span className="text-[11px] font-extrabold uppercase text-[var(--ink-soft)]">
                Estimated Gross Profit
              </span>
              <b className="text-[18px] font-extrabold text-[var(--palm)]">
                L {estimatedGrossProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </b>
              <small className="text-[10.5px] text-[var(--palm)] font-bold">
                Margin: {totalSales > 0 ? Math.round((estimatedGrossProfit / totalSales) * 100) : 0}%
              </small>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* ORDER INSPECTION & MANAGEMENT MODAL                           */}
      {/* ───────────────────────────────────────────────────────────── */}
      {inspectedOrder && (
        <>
          <div
            onClick={() => setInspectingOrderId(null)}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 transition-opacity"
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            className="fixed left-0 right-0 bottom-0 mx-auto max-w-[440px] max-h-[92dvh] overflow-y-auto z-50 bg-[var(--surface)] text-[var(--ink)] rounded-t-3xl border border-[var(--line)] border-b-0 px-4 pt-3 pb-[calc(2rem_+_env(safe-area-inset-bottom,0px))] shadow-2xl animate-in slide-in-from-bottom duration-200 flex flex-col gap-4"
          >
            <div className="w-10 h-1.5 rounded-full bg-[var(--line)] mx-auto" />

            <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
              <div>
                <span className="text-[11px] font-bold text-[var(--palm)] uppercase">
                  Order Management Command
                </span>
                <h3 className="text-[18px] font-extrabold text-[var(--ink)]">
                  Order #{inspectedOrder.order_id}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setInspectingOrderId(null)}
                className="w-8 h-8 rounded-full bg-[var(--surface-2)] flex items-center justify-center font-bold"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Current Lifecycle Status Pill */}
            <div className="p-3 rounded-2xl bg-[var(--surface-2)] flex items-center justify-between">
              <div>
                <small className="text-[10px] font-extrabold uppercase text-[var(--ink-soft)]">
                  Current Lifecycle Status
                </small>
                <b className="block text-[14px] text-[var(--ink)]">
                  {ORDER_LIFECYCLE_STATUS_LABELS[(inspectedOrder.canonical_status || inspectedOrder.status) as CanonicalOrderStatus]?.en || inspectedOrder.status}
                </b>
              </div>
              <span className="text-[12px] font-extrabold text-[var(--palm)]">
                {inspectedOrder.payment_status === 'confirmed' ? '✓ Paid' : '⏳ Payment Pending'}
              </span>
            </div>

            {/* Change Status Workflow */}
            <div className="p-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] flex flex-col gap-2.5">
              <span className="text-[12px] font-extrabold text-[var(--ink)]">
                Update Order Lifecycle Stage (14-Step Flow)
              </span>
              <div className="flex gap-2">
                <select
                  value={selectedNextStatus}
                  onChange={(e) => setSelectedNextStatus(e.target.value as any)}
                  className="flex-1 bg-[var(--surface-2)] border border-[var(--line)] rounded-xl px-2.5 py-2 text-[12px] font-bold"
                >
                  {Object.keys(ORDER_LIFECYCLE_STATUS_LABELS).map((st) => (
                    <option key={st} value={st}>
                      {ORDER_LIFECYCLE_STATUS_LABELS[st as CanonicalOrderStatus].step}. {ORDER_LIFECYCLE_STATUS_LABELS[st as CanonicalOrderStatus].en}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleExecuteStatusChange}
                  className="px-4 py-2 rounded-xl bg-[var(--palm)] text-white font-extrabold text-[12px] shadow-xs active:scale-95"
                >
                  Apply
                </button>
              </div>
              <input
                type="text"
                value={statusChangeNotes}
                onChange={(e) => setStatusChangeNotes(e.target.value)}
                placeholder="Reason or operational note for this status change…"
                className="w-full bg-[var(--surface-2)] border border-[var(--line)] rounded-xl px-2.5 py-1.5 text-[11.5px]"
              />
            </div>

            {/* Supplier Assignment */}
            <div className="p-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] flex flex-col gap-2">
              <span className="text-[12px] font-extrabold text-[var(--ink)] flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-[var(--palm)]" />
                Assigned Nursery Supplier
              </span>
              <select
                value={inspectedOrder.assigned_supplier_id || ''}
                onChange={(e) => handleAssignSupplier(e.target.value)}
                className="w-full bg-[var(--surface-2)] border border-[var(--line)] rounded-xl px-2.5 py-2 text-[12.5px] font-bold"
              >
                <option value="">-- Assign Island Grower / Supplier --</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.location})
                  </option>
                ))}
              </select>
            </div>

            {/* Audit History of Status Changes */}
            <div className="flex flex-col gap-2">
              <span className="text-[12px] font-extrabold text-[var(--ink)]">
                Permanent Status Change Audit Log
              </span>
              <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto no-scrollbar bg-[var(--surface-2)] p-2.5 rounded-2xl">
                {inspectedOrder.status_history && inspectedOrder.status_history.length > 0 ? (
                  inspectedOrder.status_history.map((h) => (
                    <div key={h.id} className="text-[11px] border-b border-[var(--line)] last:border-b-0 pb-1.5">
                      <div className="flex justify-between font-bold text-[var(--ink)]">
                        <span>→ {h.new_status.replace('_', ' ')}</span>
                        <span className="text-[var(--ink-soft)] font-normal">
                          {new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-[var(--ink-soft)]">{h.notes || 'Status updated'}</p>
                      <small className="text-[9.5px] text-[var(--ink-soft)] opacity-80">
                        Responsible: {h.responsible_name} ({h.responsible_role})
                      </small>
                    </div>
                  ))
                ) : (
                  <p className="text-[11px] text-[var(--ink-soft)]">No status changes recorded yet.</p>
                )}
              </div>
            </div>

            {/* Live Communication Chat (Customer & Supplier) */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-extrabold text-[var(--ink)] flex items-center gap-1.5">
                  <MessageSquare className="w-4 h-4 text-[var(--palm)]" />
                  Order Communications
                </span>
                <div className="flex gap-1 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setAdminChatRecipient('customer')}
                    className={`px-2 py-0.5 rounded-md font-bold ${
                      adminChatRecipient === 'customer' ? 'bg-[var(--palm)] text-white' : 'bg-[var(--surface-2)]'
                    }`}
                  >
                    To Customer
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdminChatRecipient('supplier')}
                    className={`px-2 py-0.5 rounded-md font-bold ${
                      adminChatRecipient === 'supplier' ? 'bg-[var(--palm)] text-white' : 'bg-[var(--surface-2)]'
                    }`}
                  >
                    To Supplier
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto no-scrollbar bg-[var(--surface-2)] p-2.5 rounded-2xl">
                {inspectedOrder.messages && inspectedOrder.messages.length > 0 ? (
                  inspectedOrder.messages.map((m) => (
                    <div
                      key={m.id}
                      className={`p-2 rounded-xl text-[11.5px] max-w-[85%] ${
                        m.sender_role === 'admin'
                          ? 'bg-[var(--palm)] text-white self-end text-right'
                          : 'bg-[var(--surface)] text-[var(--ink)] self-start border border-[var(--line)]'
                      }`}
                    >
                      <b className="block text-[10px] opacity-80">{m.sender_name} → {m.recipient_role}</b>
                      <span>{m.message}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-[11px] text-[var(--ink-soft)] text-center py-2">
                    No communication messages yet.
                  </p>
                )}
              </div>

              <form onSubmit={handleSendAdminMessage} className="flex gap-1.5">
                <input
                  type="text"
                  value={adminChatMsg}
                  onChange={(e) => setAdminChatMsg(e.target.value)}
                  placeholder={`Send message to ${adminChatRecipient}…`}
                  className="flex-1 bg-[var(--surface-2)] border border-[var(--line)] rounded-xl px-2.5 py-1.5 text-[12px]"
                />
                <button
                  type="submit"
                  disabled={!adminChatMsg.trim()}
                  className="px-3 py-1.5 rounded-xl bg-[var(--palm)] text-white text-[12px] font-bold disabled:opacity-40"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
