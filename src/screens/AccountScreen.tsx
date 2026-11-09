import { localizedName } from '../lib/catalogLocale';
import React, { useState } from 'react';
import {
  BookmarkCheck,
  Building2,
  Check,
  CheckCircle2,
  Compass,
  Database,
  DollarSign,
  Download,
  Edit2,
  Flower2,
  History,
  Key,
  Layers,
  Lock,
  LogOut,
  Mail,
  MapPin,
  Minus,
  Palmtree,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Shovel,
  Sparkles,
  Sprout,
  Star,
  Sun,
  Trash2,
  Truck,
  User,
  Users,
  Wrench
} from 'lucide-react';
import {
  ActiveOrder,
  AuthSession,
  CanonicalOrderStatus,
  CatalogItem,
  DeliveryZone,
  GardenItem,
  Landscaper,
  Language,
  NotificationEvent,
  RegisteredSupplier,
  SupplierPurchaseRequest,
  TransactionRecord
} from '../types';
import { LEGAL_WORKER_URL, STRINGS, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, getDecodedAdminEmail, getMaskedAdminEmail } from '../data/initialData';
import { usePhotoUrl } from '../lib/photoStore';
import { AdminOrderCommandCenter } from '../components/AdminOrderCommandCenter';
import { SupplierPortal } from '../components/SupplierPortal';
import { SupplierOnboardingPanel } from '../components/SupplierOnboardingPanel';
import { IdentificationReviewCenter } from '../components/IdentificationReviewCenter';
import { LandscapingRequestsCenter } from '../components/LandscapingRequestsCenter';
import { MyServiceRequests } from '../components/MyServiceRequests';
import { BotanicalImportPanel } from '../components/botanical/BotanicalImportPanel';
import { matchesQuery } from '../lib/botanicalRules';
import { KnowledgeCenterPanel } from '../components/botanical/KnowledgeCenterPanel';
import { BotanicalKnowledgeCorePanel } from '../components/botanical/BotanicalKnowledgeCorePanel';
import { BotanicalEvidenceReviewPanel } from '../components/botanical/BotanicalEvidenceReviewPanel';
import { ConstitutionPanel } from '../components/botanical/ConstitutionPanel';
import { AdminInsightsPanel } from '../components/AdminInsightsPanel';
import { AccountPrivacySection } from '../components/AccountPrivacySection';
import { CustomerAccountExperience } from '../components/CustomerAccountExperience';

interface AccountScreenProps {
  theme: 'system' | 'light' | 'dark';
  onThemeChange: (theme: 'system' | 'light' | 'dark') => void;
  lang: Language;
  session: AuthSession | null;
  isAdmin: boolean;
  onNavigate?: (tab: string) => void;
  onRefreshCatalog?: () => Promise<void> | void;
  onSignIn: (email: string, pass: string) => Promise<void>;
  onTemporarySignIn: (code: string) => Promise<void>;
  onSignUp: (email: string, pass: string, name: string) => Promise<{ requiresEmailConfirmation: boolean }>;
  onSignOut: () => void;
  garden: GardenItem[];
  onRemoveFromGarden: (id: string) => void;
  onGuestContinue: () => void;
  catalog: CatalogItem[];
  landscapers: Landscaper[];
  registeredSuppliers: RegisteredSupplier[];
  onAddPlant: () => void;
  onAddProduct: () => void;
  onEditItem: (item: CatalogItem) => void;
  onDeleteItem: (item: CatalogItem) => void;
  onUpdateItemStock: (id: string, delta: number) => void;
  onAddLandscaper: () => void;
  onEditLandscaper: (landscaper: Landscaper) => void;
  onDeleteLandscaper: (landscaper: Landscaper) => void;
  onAddSupplier: (supplier: RegisteredSupplier) => void;
  onDeleteSupplier: (id: string) => void;
  onResetDatabase: () => void;
  formatMoney: (val: number, cur: string) => React.ReactNode;
  zones?: DeliveryZone[];
  onUpdateZoneFee?: (zoneId: string, newFee: number, currency: 'USD' | 'HNL') => void;
  onOpenTransportModal?: () => void;
  orders?: ActiveOrder[];
  onUpdateOrder?: (order: ActiveOrder) => void;
  onAdvanceOrderStatus?: (orderId: string, nextStatus: CanonicalOrderStatus, notes?: string) => void;
  transactions?: TransactionRecord[];
  onAddTransaction?: (txn: TransactionRecord) => void;
  supplierRequests?: SupplierPurchaseRequest[];
  onUpdateSupplierRequest?: (req: SupplierPurchaseRequest) => void;
  notifications?: NotificationEvent[];
  onMarkNotificationRead?: (id: string) => void;
  onMarkAllNotificationsRead?: () => void;
  exchangeRateHnl?: number;
  onSendOrderMessage?: (orderId: string, message: string, senderId: string, senderName: string) => void;
}

/** Garden thumbnail: reads the photo from IndexedDB, falling back to a legacy inline photo. */
function GardenThumb({ photoId, legacyPhoto, alt }: { photoId?: string | null; legacyPhoto?: string | null; alt: string }) {
  const stored = usePhotoUrl(photoId);
  const src = stored || legacyPhoto || null;
  if (!src) return null;
  return <img src={src} alt={alt} className="w-full h-full object-cover" />;
}

export const AccountScreen: React.FC<AccountScreenProps> = ({
  theme,
  onThemeChange,
  lang,
  session,
  isAdmin,
  onNavigate = () => {},
  onRefreshCatalog,
  onSignIn,
  onTemporarySignIn,
  onSignUp,
  onSignOut,
  garden,
  onRemoveFromGarden,
  onGuestContinue,
  catalog,
  landscapers,
  registeredSuppliers,
  onAddPlant,
  onAddProduct,
  onEditItem,
  onDeleteItem,
  onUpdateItemStock,
  onAddLandscaper,
  onEditLandscaper,
  onDeleteLandscaper,
  onAddSupplier,
  onDeleteSupplier,
  onResetDatabase,
  formatMoney,
  zones = [],
  onUpdateZoneFee,
  onOpenTransportModal,
  orders = [],
  onUpdateOrder = () => {},
  onAdvanceOrderStatus = () => {},
  transactions = [],
  onAddTransaction = () => {},
  supplierRequests = [],
  onUpdateSupplierRequest = () => {},
  notifications = [],
  onMarkNotificationRead = () => {},
  onMarkAllNotificationsRead = () => {},
  exchangeRateHnl = 26,
  onSendOrderMessage = () => {}
}) => {
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'admin' | 'temporary'>('login');
  const [accountRole, setAccountRole] = useState<'customer' | 'nursery_owner' | 'supplier' | 'unknown'>('customer');
  const [showSupplierApplication, setShowSupplierApplication] = useState(false);
  useEffect(() => {
    if (!session || isAdmin) { setAccountRole(isAdmin ? 'unknown' : 'customer'); return; }
    if (session.user.temporary_role) { setAccountRole(session.user.temporary_role); return; }
    let active = true;
    fetch(SUPABASE_URL + '/rest/v1/profiles?select=role&id=eq.' + encodeURIComponent(session.user.id), {
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: 'Bearer ' + session.access_token, Accept: 'application/json' },
      cache: 'no-store'
    }).then(response => response.ok ? response.json() : Promise.reject(new Error('Profile role lookup failed')))
      .then(rows => { if (active && Array.isArray(rows) && rows[0]?.role) setAccountRole(String(rows[0].role) === 'nursery_owner' ? 'nursery_owner' : 'customer'); })
      .catch(error => { if (active) { console.warn('Could not load account type; using the safe customer experience.', error); setAccountRole('customer'); } });
    return () => { active = false; };
  }, [session?.access_token, session?.user?.id, session?.user?.temporary_role, isAdmin]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [temporaryCode, setTemporaryCode] = useState('');
  const [adminTab, setAdminTab] = useState<
    'command_center' | 'identification_reviews' | 'landscaping_requests' | 'botanical_import' | 'knowledge_docs' | 'knowledge_core' | 'evidence_review' | 'constitution' | 'insights' | 'supplier_portal' | 'supplier_access' | 'catalog' | 'landscapers' | 'suppliers' | 'transport' | 'database'
  >('command_center');
  const [newServiceCount, setNewServiceCount] = useState(0);
  const [activeSupplierId, setActiveSupplierId] = useState<string>(() => registeredSuppliers[0]?.id || 'sup-1');
  const [catalogFilter, setCatalogFilter] = useState<'all' | 'plants' | 'products'>('all');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authSuccessMsg, setAuthSuccessMsg] = useState('');

  // Transport fee inline editing state
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [zoneFeeInput, setZoneFeeInput] = useState<string>('');
  const [zoneCurrencyInput, setZoneCurrencyInput] = useState<'USD' | 'HNL'>('USD');
  const [zoneSuccessMsg, setZoneSuccessMsg] = useState<string>('');

  // New supplier modal state inside admin tab
  const [newSupName, setNewSupName] = useState('');
  const [newSupLocation, setNewSupLocation] = useState('');
  const [newSupDays, setNewSupDays] = useState(1);

  const t = (k: string) => STRINGS[lang]?.[k] || STRINGS.en[k] || k;

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccessMsg('');
    setAuthLoading(true);

    try {
      if (authMode === 'temporary') {
        await onTemporarySignIn(temporaryCode.trim());
      } else if (authMode === 'signup') {
        const result = await onSignUp(email, password, fullName);
        setAuthSuccessMsg(result.requiresEmailConfirmation
          ? (lang === 'es'
            ? 'Tu cuenta fue registrada. Revisa tu correo y confirma la dirección antes de iniciar sesión. También revisa spam.'
            : 'Your account was registered. Check your email and confirm your address before signing in. Check your spam folder too.')
          : (lang === 'es' ? '¡Cuenta creada y sesión iniciada!' : 'Account created and signed in successfully.'));
      } else if (authMode === 'admin') {
        // Authenticate strictly with the password saved in Supabase
        const targetEmail = getDecodedAdminEmail();
        await onSignIn(targetEmail, password);
      } else {
        await onSignIn(email, password);
      }
    } catch (err: any) {
      setAuthError(err.message || 'Authentication failed. Please verify your password.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleCreateSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupName.trim() || !newSupLocation.trim()) return;
    const item: RegisteredSupplier = {
      id: `sup-${Date.now()}`,
      name: newSupName.trim(),
      location: newSupLocation.trim(),
      delivery_days: Number(newSupDays) || 1,
      active: true
    };
    onAddSupplier(item);
    setNewSupName('');
    setNewSupLocation('');
  };

  // Filtered catalog items for the admin database manager
  const filteredCatalog = catalog.filter((item) => {
    if (catalogFilter === 'plants' && item.t !== 'plant') return false;
    if (catalogFilter === 'products' && item.t !== 'product') return false;
    if (catalogSearch.trim()) return matchesQuery(item, catalogSearch);
    return true;
  });

  const handleExportJson = () => {
    const backup = {
      exportedAt: new Date().toISOString(),
      catalog,
      landscapers,
      registeredSuppliers
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `verde-roatan-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (session?.user.temporary_role === 'supplier') {
    return (
      <div className="flex flex-col gap-4 pb-8">
        <SupplierOnboardingPanel lang={lang} session={session} isAdmin={false} temporarySupplier />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-8">
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
        <div className="flex items-center gap-2 mb-3">
          <Sun className="w-4 h-4 text-[var(--palm)]" />
          <div>
            <h2 className="text-[14px] font-extrabold text-[var(--ink)]">{lang === 'es' ? 'Apariencia' : 'Appearance'}</h2>
            <p className="text-[11.5px] text-[var(--ink-soft)]">{lang === 'es' ? 'Elige cómo se ve RootWise en tu dispositivo.' : 'Choose how RootWise looks on your device.'}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(['light', 'dark', 'system'] as const).map((mode) => (
            <button key={mode} type="button" aria-pressed={theme === mode} onClick={() => onThemeChange(mode)}
              className={`rounded-xl border px-2 py-2.5 text-[12px] font-bold transition-colors ${theme === mode ? 'border-[var(--palm)] bg-[var(--palm)] text-[var(--on-palm)]' : 'border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)]'}`}>
              {mode === 'light' ? (lang === 'es' ? 'Claro' : 'Light') : mode === 'dark' ? (lang === 'es' ? 'Oscuro' : 'Dark') : (lang === 'es' ? 'Sistema' : 'System')}
            </button>
          ))}
        </div>
      </section>
      {/* If Authenticated */}
      {session ? (
        <div className="flex flex-col gap-4">
          {/* User Profile Card - MASKED IDENTITY */}
          <div className="flex items-center justify-between bg-[var(--surface)] border border-[var(--line)] rounded-3xl p-4 shadow-xs">
            <div className="flex items-center gap-3">
              <span className="w-12 h-12 rounded-full bg-[var(--palm)] text-white font-display font-extrabold text-[16px] flex items-center justify-center">
                {isAdmin ? 'A' : (session.user.full_name ? session.user.full_name[0].toUpperCase() : 'U')}
              </span>
              <div className="flex flex-col">
                <b className="text-[15px] text-[var(--ink)] font-bold">
                  {isAdmin ? 'Administrator Account' : (session.user.full_name || 'Member Account')}
                </b>
                <span className="text-[12px] text-[var(--ink-soft)] font-mono">
                  {isAdmin ? getMaskedAdminEmail() : session.user.email}
                </span>
                {isAdmin && (
                  <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-[var(--palm)] text-white w-fit mt-1 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    Supabase Verified Admin
                  </span>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={onSignOut}
              title="Sign out"
              className="p-2.5 rounded-xl bg-[var(--surface-2)] text-[var(--ink-soft)] hover:text-red-600 hover:bg-red-50 transition-all"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

          {!isAdmin && session && accountRole === 'nursery_owner' && (
            <SupplierOnboardingPanel lang={lang} session={session} isAdmin={false} onCatalogChanged={onRefreshCatalog} />
          )}
          {!isAdmin && session && accountRole !== 'nursery_owner' && (
            <>
              <CustomerAccountExperience lang={lang} displayName={session.user.full_name || ''} gardenCount={garden.length} orderCount={orders.length} onNavigate={onNavigate} />
              {session.user.temporary_role !== 'customer' && <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3">
                <button type="button" onClick={() => setShowSupplierApplication(value => !value)} className="w-full text-left text-xs font-bold text-[var(--ink)]">{showSupplierApplication ? (lang === 'es' ? 'Ocultar solicitud de proveedor' : 'Hide supplier application') : (lang === 'es' ? '¿Tienes un vivero? Solicita acceso de proveedor' : 'Own a nursery? Apply for supplier access')}</button>
                {showSupplierApplication && <div className="mt-3"><SupplierOnboardingPanel lang={lang} session={session} isAdmin={false} /></div>}
              </div>}
            </>
          )}

          {/* Plant Intelligence Studio (Admin Exclusive Live Management) */}
          {isAdmin && (
            <div className="flex flex-col gap-3 bg-[var(--surface)] border-2 border-[var(--palm)] rounded-3xl p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <b className="text-[16px] text-[var(--palm)] font-extrabold flex items-center gap-1.5">
                    <Shield className="w-4.5 h-4.5" />
                    {t('adminStudio')}
                  </b>
                  <small className="text-[11.5px] text-[var(--ink-soft)] block">
                    Manage Plants, Products, Registered Suppliers & Landscapers
                  </small>
                </div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider bg-[var(--palm)] text-white px-2 py-0.5 rounded-md">
                  ADMIN ACTIVE
                </span>
              </div>

              {/* Subtabs */}
              <div className="flex flex-wrap gap-1 bg-[var(--surface-2)] p-1 rounded-xl text-center">
                <button
                  type="button"
                  onClick={() => setAdminTab('command_center')}
                  className={`py-1.5 px-2.5 text-[11px] font-extrabold rounded-lg whitespace-nowrap grow justify-center transition-all flex items-center gap-1 ${
                    adminTab === 'command_center' ? 'bg-[var(--palm)] text-white shadow-xs' : 'text-[var(--ink-soft)] hover:text-[var(--ink)]'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Orders & Command
                </button>
                <button
                  type="button"
                  onClick={() => setAdminTab('knowledge_docs')}
                  className={`py-1.5 px-2.5 text-[11px] font-extrabold rounded-lg whitespace-nowrap grow justify-center transition-all flex items-center gap-1 ${
                    adminTab === 'knowledge_docs' ? 'bg-[var(--palm)] text-white shadow-xs' : 'text-[var(--ink-soft)] hover:text-[var(--ink)]'
                  }`}
                >
                  <Compass className="w-3.5 h-3.5" />
                  Botanical Knowledge Center
                </button>
                <button
                  type="button"
                  onClick={() => setAdminTab('knowledge_core')}
                  className={`py-1.5 px-2.5 text-[11px] font-extrabold rounded-lg whitespace-nowrap grow justify-center transition-all flex items-center gap-1 ${
                    adminTab === 'knowledge_core' ? 'bg-[var(--palm)] text-white shadow-xs' : 'text-[var(--ink-soft)] hover:text-[var(--ink)]'
                  }`}
                >
                  <Database className="w-3.5 h-3.5" />
                  Knowledge Core
                </button>
                <button
                  type="button"
                  onClick={() => setAdminTab('evidence_review')}
                  className={`py-1.5 px-2.5 text-[11px] font-extrabold rounded-lg whitespace-nowrap grow justify-center transition-all flex items-center gap-1 ${adminTab === 'evidence_review' ? 'bg-[var(--palm)] text-white shadow-xs' : 'text-[var(--ink-soft)] hover:text-[var(--ink)]'}`}
                >
                  <Database className="w-3.5 h-3.5" />
                  Evidence Review
                </button>
                <button
                  type="button"
                  onClick={() => setAdminTab('identification_reviews')}
                  className={`py-1.5 px-2.5 text-[11px] font-extrabold rounded-lg whitespace-nowrap grow justify-center transition-all flex items-center gap-1 ${
                    adminTab === 'identification_reviews' ? 'bg-[var(--palm)] text-white shadow-xs' : 'text-[var(--ink-soft)] hover:text-[var(--ink)]'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  ID Reviews
                </button>
                <button
                  type="button"
                  onClick={() => setAdminTab('landscaping_requests')}
                  className={`py-1.5 px-2.5 text-[11px] font-extrabold rounded-lg whitespace-nowrap grow justify-center transition-all flex items-center gap-1 ${
                    adminTab === 'landscaping_requests' ? 'bg-[var(--palm)] text-white shadow-xs' : 'text-[var(--ink-soft)] hover:text-[var(--ink)]'
                  }`}
                >
                  Landscaping
                  {newServiceCount > 0 && (
                    <span className="bg-red-600 text-white rounded-full px-1.5 text-[10px] leading-4">{newServiceCount}</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setAdminTab('botanical_import')}
                  className={`py-1.5 px-2.5 text-[11px] font-extrabold rounded-lg whitespace-nowrap grow justify-center transition-all flex items-center gap-1 ${
                    adminTab === 'botanical_import' ? 'bg-[var(--palm)] text-white shadow-xs' : 'text-[var(--ink-soft)] hover:text-[var(--ink)]'
                  }`}
                >
                  Bulk Import
                </button>
                <button
                  type="button"
                  onClick={() => setAdminTab('constitution')}
                  className={`py-1.5 px-2.5 text-[11px] font-extrabold rounded-lg whitespace-nowrap transition-all flex items-center gap-1 grow justify-center ${
                    adminTab === 'constitution' ? 'bg-[var(--palm)] text-white shadow-xs' : 'text-[var(--ink-soft)] hover:text-[var(--ink)]'
                  }`}
                >
                  Constitution
                </button>
                <button
                  type="button"
                  onClick={() => setAdminTab('insights')}
                  className={`py-1.5 px-2.5 text-[11px] font-extrabold rounded-lg whitespace-nowrap transition-all flex items-center gap-1 grow justify-center ${
                    adminTab === 'insights' ? 'bg-[var(--palm)] text-white shadow-xs' : 'text-[var(--ink-soft)] hover:text-[var(--ink)]'
                  }`}
                >
                  Insights
                </button>
                <button
                  type="button"
                  onClick={() => setAdminTab('supplier_portal')}
                  className={`py-1.5 px-2.5 text-[11px] font-extrabold rounded-lg whitespace-nowrap grow justify-center transition-all flex items-center gap-1 ${
                    adminTab === 'supplier_portal' ? 'bg-[var(--palm)] text-white shadow-xs' : 'text-[var(--ink-soft)] hover:text-[var(--ink)]'
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5" />
                  Supplier Portal
                </button>
                <button
                  type="button"
                  onClick={() => setAdminTab('supplier_access')}
                  className={`py-1.5 px-2.5 text-[11px] font-extrabold rounded-lg whitespace-nowrap grow justify-center transition-all flex items-center gap-1 ${
                    adminTab === 'supplier_access' ? 'bg-[var(--palm)] text-white shadow-xs' : 'text-[var(--ink-soft)] hover:text-[var(--ink)]'
                  }`}
                >
                  <Key className="w-3.5 h-3.5" />
                  Supplier Access
                </button>
                <button
                  type="button"
                  onClick={() => setAdminTab('catalog')}
                  className={`py-1.5 px-2.5 text-[11px] font-bold rounded-lg whitespace-nowrap grow transition-all ${
                    adminTab === 'catalog' ? 'bg-[var(--surface)] text-[var(--ink)] shadow-xs' : 'text-[var(--ink-soft)]'
                  }`}
                >
                  Plants & Store
                </button>
                <button
                  type="button"
                  onClick={() => setAdminTab('suppliers')}
                  className={`py-1.5 px-2.5 text-[11px] font-bold rounded-lg whitespace-nowrap grow transition-all ${
                    adminTab === 'suppliers' ? 'bg-[var(--surface)] text-[var(--ink)] shadow-xs' : 'text-[var(--ink-soft)]'
                  }`}
                >
                  Suppliers
                </button>
                <button
                  type="button"
                  onClick={() => setAdminTab('landscapers')}
                  className={`py-1.5 px-2.5 text-[11px] font-bold rounded-lg whitespace-nowrap grow transition-all ${
                    adminTab === 'landscapers' ? 'bg-[var(--surface)] text-[var(--ink)] shadow-xs' : 'text-[var(--ink-soft)]'
                  }`}
                >
                  Landscapers
                </button>
                <button
                  type="button"
                  onClick={() => setAdminTab('transport')}
                  className={`py-1.5 px-2.5 text-[11px] font-bold rounded-lg whitespace-nowrap grow transition-all flex items-center justify-center gap-1 ${
                    adminTab === 'transport' ? 'bg-[var(--surface)] text-[var(--palm)] shadow-xs' : 'text-[var(--ink-soft)]'
                  }`}
                >
                  <Truck className="w-3.5 h-3.5" />
                  Transport Fees
                </button>
                <button
                  type="button"
                  onClick={() => setAdminTab('database')}
                  className={`py-1.5 px-2.5 text-[11px] font-bold rounded-lg whitespace-nowrap grow transition-all ${
                    adminTab === 'database' ? 'bg-[var(--surface)] text-[var(--ink)] shadow-xs' : 'text-[var(--ink-soft)]'
                  }`}
                >
                  Database
                </button>
              </div>

              {/* Admin Panel Body */}
              <div className="flex flex-col gap-3 pt-1">
                {/* 0. Central Command Center (Orders, Transactions, Notifications, Financial Reports) */}
                {adminTab === 'command_center' && (
                  <AdminOrderCommandCenter
                    lang={lang}
                    orders={orders}
                    onUpdateOrder={onUpdateOrder}
                    onAdvanceOrderStatus={onAdvanceOrderStatus}
                    transactions={transactions}
                    onAddTransaction={onAddTransaction}
                    supplierRequests={supplierRequests}
                    onUpdateSupplierRequest={onUpdateSupplierRequest}
                    notifications={notifications}
                    onMarkNotificationRead={onMarkNotificationRead}
                    onMarkAllNotificationsRead={onMarkAllNotificationsRead}
                    suppliers={registeredSuppliers}
                    formatMoney={formatMoney}
                    exchangeRateHnl={exchangeRateHnl}
                  />
                )}

                {adminTab === 'identification_reviews' && (
                  <IdentificationReviewCenter
                    lang={lang}
                    accessToken={session?.access_token}
                  />
                )}

                {adminTab === 'landscaping_requests' && (
                  <LandscapingRequestsCenter
                    lang={lang}
                    accessToken={session?.access_token}
                    landscapers={landscapers}
                    adminName={session?.user.full_name || 'Administrator'}
                    onNewCount={setNewServiceCount}
                  />
                )}

                {adminTab === 'botanical_import' && (
                  <BotanicalImportPanel lang={lang} accessToken={session?.access_token} catalog={catalog} />
                )}

                {adminTab === 'knowledge_docs' && (
                  <KnowledgeCenterPanel lang={lang} accessToken={session?.access_token} />
                )}
                {adminTab === 'knowledge_core' && (
                  <BotanicalKnowledgeCorePanel lang={lang} accessToken={session?.access_token} />
                )}
                {adminTab === 'evidence_review' && (
                  <BotanicalEvidenceReviewPanel lang={lang} accessToken={session?.access_token} />
                )}
                {adminTab === 'insights' && (
                  <AdminInsightsPanel lang={lang} orders={orders} exchangeRateHnl={exchangeRateHnl} accessToken={session?.access_token} />
                )}
                {adminTab === 'constitution' && (
                  <ConstitutionPanel lang={lang} accessToken={session?.access_token} />
                )}

                {/* 0.1 Dedicated Supplier Interaction Portal */}
                {adminTab === 'supplier_portal' && (
                  <SupplierPortal
                    lang={lang}
                    suppliers={registeredSuppliers}
                    currentSupplierId={activeSupplierId}
                    onSelectSupplierId={setActiveSupplierId}
                    purchaseRequests={supplierRequests}
                    onUpdateRequest={onUpdateSupplierRequest}
                    orders={orders}
                    onSendMessage={(orderId, message, supId, supName) => {
                      onSendOrderMessage(orderId, message, supId, supName);
                    }}
                    formatMoney={formatMoney}
                  />
                )}

                {adminTab === 'supplier_access' && session && (
                  <SupplierOnboardingPanel lang={lang} session={session} isAdmin onCatalogChanged={onRefreshCatalog} />
                )}

                {/* 1. Catalog / Plants & Products */}
                {adminTab === 'catalog' && (
                  <div className="flex flex-col gap-2.5">
                    {/* Action Bar */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={onAddPlant}
                          className="inline-flex items-center gap-1 text-[11.5px] font-bold px-2.5 py-1.5 rounded-xl bg-[var(--palm)] text-white hover:opacity-90 active:scale-95 shadow-xs"
                        >
                          <Plus className="w-3.5 h-3.5" /> + Plant
                        </button>
                        <button
                          type="button"
                          onClick={onAddProduct}
                          className="inline-flex items-center gap-1 text-[11.5px] font-bold px-2.5 py-1.5 rounded-xl bg-[var(--lagoon)] text-white hover:opacity-90 active:scale-95 shadow-xs"
                        >
                          <Plus className="w-3.5 h-3.5" /> + Product
                        </button>
                      </div>
                      <span className="text-[11.5px] text-[var(--ink-soft)] font-medium">
                        {filteredCatalog.length} item{filteredCatalog.length === 1 ? '' : 's'}
                      </span>
                    </div>

                    {/* Search & Filter */}
                    <div className="flex items-center gap-1.5">
                      <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-[var(--ink-soft)]" />
                        <input
                          type="search"
                          value={catalogSearch}
                          onChange={(e) => setCatalogSearch(e.target.value)}
                          placeholder="Search database…"
                          className="w-full bg-[var(--surface-2)] border border-[var(--line)] rounded-xl pl-8 pr-2 py-1 text-[12px] focus:outline-none"
                        />
                      </div>
                      <div className="flex bg-[var(--surface-2)] p-0.5 rounded-xl text-[11px] font-bold">
                        <button
                          type="button"
                          onClick={() => setCatalogFilter('all')}
                          className={`px-2 py-1 rounded-lg ${catalogFilter === 'all' ? 'bg-[var(--surface)] text-[var(--ink)] shadow-xs' : 'text-[var(--ink-soft)]'}`}
                        >
                          All
                        </button>
                        <button
                          type="button"
                          onClick={() => setCatalogFilter('plants')}
                          className={`px-2 py-1 rounded-lg ${catalogFilter === 'plants' ? 'bg-[var(--surface)] text-[var(--ink)] shadow-xs' : 'text-[var(--ink-soft)]'}`}
                        >
                          Plants
                        </button>
                        <button
                          type="button"
                          onClick={() => setCatalogFilter('products')}
                          className={`px-2 py-1 rounded-lg ${catalogFilter === 'products' ? 'bg-[var(--surface)] text-[var(--ink)] shadow-xs' : 'text-[var(--ink-soft)]'}`}
                        >
                          Products
                        </button>
                      </div>
                    </div>

                    {/* Catalog Item List */}
                    <div className="flex flex-col gap-2 max-h-72 overflow-y-auto no-scrollbar">
                      {filteredCatalog.length === 0 ? (
                        <p className="text-[12px] text-[var(--ink-soft)] text-center py-4">
                          No matching catalog entries found.
                        </p>
                      ) : (
                        filteredCatalog.map((item) => (
                          <div
                            key={item.id}
                            className="bg-[var(--surface-2)] p-2.5 rounded-2xl flex items-center justify-between gap-2.5 border border-[var(--line)] shadow-xs"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-10 h-10 rounded-xl bg-[var(--surface)] overflow-hidden shrink-0 flex items-center justify-center">
                                {item.image_url ? (
                                  <img src={item.image_url} alt={localizedName(item, lang)} className="w-full h-full object-cover" />
                                ) : item.t === 'plant' ? (
                                  <Palmtree className="w-5 h-5 text-[var(--palm)]" />
                                ) : (
                                  <Shovel className="w-5 h-5 text-[var(--lagoon)]" />
                                )}
                              </div>
                              <div className="flex flex-col min-w-0">
                                <b className="text-[13px] text-[var(--ink)] font-bold truncate">
                                  {localizedName(item, lang)}
                                </b>
                                <small className="text-[11px] text-[var(--ink-soft)] truncate">
                                  {item.category} · {formatMoney(item.price, item.currency)} · {item.size}
                                </small>
                                <small className="text-[10px] text-[var(--palm)] truncate font-semibold">
                                  {item.nursery}
                                </small>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {/* Quick stock stepper */}
                              <div className="flex items-center bg-[var(--surface)] rounded-lg p-0.5 border border-[var(--line)]">
                                <button
                                  type="button"
                                  onClick={() => onUpdateItemStock(item.id, -1)}
                                  title="Decrease stock"
                                  className="w-5 h-5 flex items-center justify-center rounded text-[var(--ink-soft)] hover:text-black hover:bg-[var(--surface-2)] font-bold"
                                >
                                  -
                                </button>
                                <span className="w-6 text-center text-[11.5px] font-bold tabular-nums">
                                  {item.stock_quantity}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => onUpdateItemStock(item.id, 1)}
                                  title="Increase stock"
                                  className="w-5 h-5 flex items-center justify-center rounded text-[var(--ink-soft)] hover:text-black hover:bg-[var(--surface-2)] font-bold"
                                >
                                  +
                                </button>
                              </div>

                              <button
                                type="button"
                                onClick={() => onEditItem(item)}
                                title="Edit item parameters"
                                className="p-1.5 rounded-lg bg-[var(--surface)] text-[var(--ink)] hover:text-[var(--palm)] border border-[var(--line)] transition-all"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => onDeleteItem(item)}
                                title="Delete from database"
                                className="p-1.5 rounded-lg bg-[var(--surface)] text-red-600 hover:bg-red-50 border border-red-200 transition-all"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* 2. Landscapers Tab */}
                {adminTab === 'landscapers' && (
                  <div className="flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[12.5px] font-bold text-[var(--ink)]">
                        Roatán Landscaping Partners ({landscapers.length})
                      </span>
                      <button
                        type="button"
                        onClick={onAddLandscaper}
                        className="inline-flex items-center gap-1 text-[11.5px] font-bold px-2.5 py-1.5 rounded-xl bg-[var(--palm)] text-white hover:opacity-90 active:scale-95 shadow-xs"
                      >
                        <Plus className="w-3.5 h-3.5" /> + Landscaper
                      </button>
                    </div>

                    <div className="flex flex-col gap-2 max-h-72 overflow-y-auto no-scrollbar">
                      {landscapers.map((crew) => (
                        <div
                          key={crew.id}
                          className="bg-[var(--surface-2)] p-2.5 rounded-2xl flex items-center justify-between gap-2.5 border border-[var(--line)] shadow-xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="w-10 h-10 rounded-full bg-[var(--palm)] text-white font-display font-extrabold text-[13px] flex items-center justify-center shrink-0">
                              {crew.ini}
                            </span>
                            <div className="flex flex-col min-w-0">
                              <b className="text-[13px] text-[var(--ink)] font-bold truncate">
                                {crew.name}
                              </b>
                              <small className="text-[11px] text-[var(--ink-soft)] truncate">
                                ★ {crew.rate} · {crew.jobs} jobs · {crew.areas}
                              </small>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => onEditLandscaper(crew)}
                              title="Edit landscaper"
                              className="p-1.5 rounded-lg bg-[var(--surface)] text-[var(--ink)] hover:text-[var(--palm)] border border-[var(--line)] transition-all"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteLandscaper(crew)}
                              title="Delete landscaper"
                              className="p-1.5 rounded-lg bg-[var(--surface)] text-red-600 hover:bg-red-50 border border-red-200 transition-all"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. Registered Suppliers & Locations Tab */}
                {adminTab === 'suppliers' && (
                  <div className="flex flex-col gap-3 text-[12px]">
                    <div className="flex items-center justify-between">
                      <span className="text-[12.5px] font-bold text-[var(--ink)]">
                        Registered Suppliers & Nursery Beds ({registeredSuppliers.length})
                      </span>
                    </div>
                    <p className="text-[11.5px] text-[var(--ink-soft)] leading-snug">
                      These locations populate the supplier selection pop box when adding or editing plants and products.
                    </p>

                    {/* Add Supplier Form */}
                    <form onSubmit={handleCreateSupplier} className="bg-[var(--surface-2)] p-2.5 rounded-2xl flex flex-col gap-2 border border-[var(--line)]">
                      <b className="text-[12px] text-[var(--ink)]">+ Register New Supplier / Nursery Bed</b>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          required
                          value={newSupName}
                          onChange={(e) => setNewSupName(e.target.value)}
                          placeholder="Supplier Name (e.g. Maya Palm)"
                          className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl px-2.5 py-1.5 text-[12px]"
                        />
                        <input
                          type="text"
                          required
                          value={newSupLocation}
                          onChange={(e) => setNewSupLocation(e.target.value)}
                          placeholder="Island Location (e.g. Oak Ridge East)"
                          className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl px-2.5 py-1.5 text-[12px]"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <label className="text-[11px] font-bold text-[var(--ink-soft)]">Delivery Days:</label>
                          <input
                            type="number"
                            min="1"
                            max="7"
                            value={newSupDays}
                            onChange={(e) => setNewSupDays(Number(e.target.value))}
                            className="w-14 bg-[var(--surface)] border border-[var(--line)] rounded-lg px-2 py-1 text-[12px] text-center"
                          />
                        </div>
                        <button
                          type="submit"
                          className="py-1.5 px-3 rounded-xl bg-[var(--palm)] text-white text-[12px] font-bold shadow-xs active:scale-95"
                        >
                          Register Supplier
                        </button>
                      </div>
                    </form>

                    {/* Suppliers List */}
                    <div className="flex flex-col gap-2 max-h-56 overflow-y-auto no-scrollbar">
                      {registeredSuppliers.map((sup) => (
                        <div
                          key={sup.id}
                          className="bg-[var(--surface-2)] p-2.5 rounded-xl flex items-center justify-between gap-2 border border-[var(--line)]"
                        >
                          <div className="flex flex-col min-w-0">
                            <b className="text-[13px] text-[var(--ink)] truncate">{sup.name}</b>
                            <small className="text-[11px] text-[var(--ink-soft)] truncate">
                              {sup.location} · ~{sup.delivery_days || 1} day delivery
                            </small>
                          </div>
                          <button
                            type="button"
                            onClick={() => onDeleteSupplier(sup.id)}
                            title="Delete supplier"
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 4. Transport Fees Management */}
                {adminTab === 'transport' && (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <b className="text-[13px] text-[var(--ink)] flex items-center gap-1.5">
                          <Truck className="w-4 h-4 text-[var(--palm)]" />
                          <span>Roatán Island Transport Fees ({zones.length} Areas)</span>
                        </b>
                        <small className="text-[11px] text-[var(--ink-soft)] block">
                          Modify transport and logistics fees charged for deliveries across Roatán.
                        </small>
                      </div>
                      {onOpenTransportModal && (
                        <button
                          type="button"
                          onClick={onOpenTransportModal}
                          className="px-2.5 py-1.5 rounded-xl bg-[var(--palm)] text-white text-[11px] font-bold shadow-xs active:scale-95 flex items-center gap-1"
                        >
                          <Edit2 className="w-3 h-3" />
                          <span>Modal Manager</span>
                        </button>
                      )}
                    </div>

                    {zoneSuccessMsg && (
                      <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/25 text-emerald-800 dark:text-emerald-300 text-[12px] font-bold flex items-center gap-2">
                        <Check className="w-3.5 h-3.5" />
                        <span>{zoneSuccessMsg}</span>
                      </div>
                    )}

                    {/* Zone Cards List */}
                    <div className="flex flex-col gap-2 max-h-80 overflow-y-auto no-scrollbar">
                      {zones.map((zone) => {
                        const isEditing = editingZoneId === zone.id;

                        return (
                          <div
                            key={zone.id}
                            className={`p-3 rounded-2xl border transition-all ${
                              isEditing
                                ? 'bg-[var(--surface)] border-[var(--palm)] shadow-md ring-1 ring-[var(--palm)]/30'
                                : 'bg-[var(--surface-2)] border-[var(--line)] hover:border-[var(--palm)]/50'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span className="w-8 h-8 rounded-xl bg-[var(--palm)]/15 text-[var(--palm)] flex items-center justify-center shrink-0">
                                  <MapPin className="w-4 h-4" />
                                </span>
                                <div className="flex flex-col min-w-0">
                                  <b className="text-[13px] text-[var(--ink)] truncate">
                                    {zone.name}
                                  </b>
                                  <small className="text-[11px] text-[var(--ink-soft)] truncate">
                                    {zone.description || 'Roatán Delivery Area'}
                                  </small>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                {!isEditing ? (
                                  <>
                                    <span className="text-[14px] font-black text-[var(--palm)] tabular-nums px-2 py-0.5 rounded-lg bg-[var(--surface)] border border-[var(--line)]">
                                      {zone.currency === 'USD' ? `$${zone.fee}` : `L ${zone.fee}`}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingZoneId(zone.id);
                                        setZoneFeeInput(String(zone.fee));
                                        setZoneCurrencyInput(zone.currency);
                                      }}
                                      className="px-2.5 py-1.5 rounded-xl bg-[var(--surface)] hover:bg-[var(--palm)] hover:text-white text-[var(--ink)] text-[11.5px] font-bold border border-[var(--line)] transition-all flex items-center gap-1"
                                    >
                                      <Edit2 className="w-3 h-3" />
                                      <span>Edit Fee</span>
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setEditingZoneId(null)}
                                    className="text-[11.5px] text-[var(--ink-soft)] hover:underline"
                                  >
                                    Cancel
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Inline Edit Form */}
                            {isEditing && (
                              <form
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  const parsed = parseFloat(zoneFeeInput);
                                  if (isNaN(parsed) || parsed < 0) return;
                                  if (onUpdateZoneFee) {
                                    onUpdateZoneFee(zone.id, parsed, zoneCurrencyInput);
                                  }
                                  setZoneSuccessMsg(`Transport fee updated for ${zone.name}: ${zoneCurrencyInput === 'USD' ? '$' : 'L '}${parsed}`);
                                  setTimeout(() => setZoneSuccessMsg(''), 2500);
                                  setEditingZoneId(null);
                                }}
                                className="mt-3 pt-3 border-t border-[var(--line)] flex flex-wrap items-center gap-2"
                              >
                                <div className="flex items-center gap-1.5 flex-1 min-w-[120px]">
                                  <label className="text-[11px] font-bold text-[var(--ink)]">
                                    New Fee:
                                  </label>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.5"
                                    required
                                    value={zoneFeeInput}
                                    onChange={(e) => setZoneFeeInput(e.target.value)}
                                    className="w-20 bg-[var(--surface)] border border-[var(--line)] rounded-lg px-2 py-1 text-[13px] font-extrabold text-[var(--ink)] tabular-nums"
                                  />
                                </div>

                                <div className="flex items-center gap-1.5">
                                  <label className="text-[11px] font-bold text-[var(--ink)]">
                                    Currency:
                                  </label>
                                  <select
                                    value={zoneCurrencyInput}
                                    onChange={(e) => setZoneCurrencyInput(e.target.value as 'USD' | 'HNL')}
                                    className="bg-[var(--surface)] border border-[var(--line)] rounded-lg px-2 py-1 text-[12px] font-bold text-[var(--ink)]"
                                  >
                                    <option value="USD">USD ($)</option>
                                    <option value="HNL">HNL (L)</option>
                                  </select>
                                </div>

                                <button
                                  type="submit"
                                  className="px-3 py-1 rounded-xl bg-[var(--palm)] text-white text-[12px] font-extrabold shadow-xs active:scale-95 flex items-center gap-1"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Save</span>
                                </button>
                              </form>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 5. Database Controls & Backups */}
                {adminTab === 'database' && (
                  <div className="flex flex-col gap-2.5 text-[12px]">
                    <span className="text-[12.5px] font-bold text-[var(--ink)]">
                      Database Maintenance & Synchronization
                    </span>
                    <p className="text-[12px] text-[var(--ink-soft)]">
                      All plants, products, landscapers, and suppliers are saved locally. You can export a full JSON backup or reset to default nursery stock.
                    </p>

                    <div className="grid grid-cols-2 gap-2 mt-1">
                      <button
                        type="button"
                        onClick={handleExportJson}
                        className="py-2.5 px-3 rounded-xl bg-[var(--surface-2)] hover:bg-[var(--palm)] hover:text-white font-bold text-[12px] flex items-center justify-center gap-1.5 transition-all border border-[var(--line)]"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Export Backup (JSON)
                      </button>

                      <button
                        type="button"
                        onClick={onResetDatabase}
                        className="py-2.5 px-3 rounded-xl bg-red-50 hover:bg-red-600 hover:text-white text-red-600 font-bold text-[12px] flex items-center justify-center gap-1.5 transition-all border border-red-200"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Reset to Defaults
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {session?.access_token && !isAdmin && (
            <MyServiceRequests lang={lang} accessToken={session.access_token} />
          )}

          <AccountPrivacySection lang={lang} accessToken={session?.access_token} isAdmin={isAdmin} onDeleted={onSignOut} />

          {/* My Garden Section */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-[18px] font-extrabold text-[var(--ink)] flex items-center gap-1.5">
                <BookmarkCheck className="w-4 h-4 text-[var(--palm)]" />
                {t('myGarden')} ({garden.length})
              </h2>
            </div>

            {garden.length === 0 ? (
              <div className="bg-[var(--surface)] border border-[var(--line)] rounded-3xl p-6 text-center text-[var(--ink-soft)] flex flex-col items-center gap-2">
                <Sprout className="w-8 h-8 opacity-40" />
                <p className="text-[13px]">{t('noGardenItems')}</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {garden.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 bg-[var(--surface)] border border-[var(--line)] rounded-2xl p-3 shadow-xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-12 h-12 rounded-xl bg-[var(--surface-2)] overflow-hidden shrink-0">
                        {item.photoId || item.photo ? (
                          <GardenThumb photoId={item.photoId} legacyPhoto={item.photo} alt={item.name} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[var(--palm)]">
                            <Sprout className="w-6 h-6" />
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col min-w-0">
                        <b className="text-[14px] text-[var(--ink)] font-bold truncate">
                          {item.name}
                        </b>
                        <small className="text-[11px] text-[var(--ink-soft)]">
                          {item.date} · {item.mode === 'pest' ? 'Pest Diagnosis' : 'Specimen'}
                        </small>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onRemoveFromGarden(item.id)}
                      className="p-2 text-[var(--ink-soft)] hover:text-red-600 active:scale-90 transition-all shrink-0"
                      title="Remove from My Garden"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Sign Up / Sign In Form - STRICT SUPABASE PASSWORD AUTHENTICATION */
        <div className="flex flex-col gap-4 bg-[var(--surface)] border border-[var(--line)] rounded-3xl p-5 shadow-xs">
          <header className="flex flex-col gap-0.5 text-center">
            <span className="text-[11px] font-extrabold tracking-wider uppercase text-[var(--palm)]">
              Verde Roatán
            </span>
            <h2 className="text-[22px] font-extrabold text-[var(--ink)]">
              {authMode === 'admin' ? 'Administrator Verification' : t('welcome')}
            </h2>
            <p className="text-[12.5px] text-[var(--ink-soft)]">
              {authMode === 'admin'
                ? 'Enter your Supabase password to authenticate administrative access. No bypass allowed.'
                : 'Sign in to access your garden, manage orders, and run plant identification.'}
            </p>
          </header>

          {/* Segmented Auth Mode */}
          <div className="grid grid-cols-4 bg-[var(--surface-2)] p-1 rounded-2xl gap-1">
            <button
              type="button"
              onClick={() => {
                setAuthMode('login');
                setAuthError('');
              }}
              className={`py-2 rounded-xl text-[12.5px] font-bold transition-all ${
                authMode === 'login'
                  ? 'bg-[var(--surface)] text-[var(--ink)] shadow-xs'
                  : 'text-[var(--ink-soft)]'
              }`}
            >
              {t('logIn')}
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode('signup');
                setAuthError('');
              }}
              className={`py-2 rounded-xl text-[12.5px] font-bold transition-all ${
                authMode === 'signup'
                  ? 'bg-[var(--surface)] text-[var(--ink)] shadow-xs'
                  : 'text-[var(--ink-soft)]'
              }`}
            >
              {t('createAcc')}
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode('temporary');
                setAuthError('');
                setPassword('');
              }}
              className={`py-2 rounded-xl text-[11px] font-bold transition-all ${
                authMode === 'temporary'
                  ? 'bg-[var(--surface)] text-[var(--palm)] shadow-xs'
                  : 'text-[var(--ink-soft)]'
              }`}
            >
              Code
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode('admin');
                setAuthError('');
                setPassword('');
              }}
              className={`py-2 rounded-xl text-[12.5px] font-bold transition-all flex items-center justify-center gap-1 ${
                authMode === 'admin'
                  ? 'bg-[var(--surface)] text-[var(--palm)] shadow-xs'
                  : 'text-[var(--ink-soft)]'
              }`}
            >
              <Lock className="w-3 h-3" />
              Admin
            </button>
          </div>

          <form onSubmit={handleAuthSubmit} className="flex flex-col gap-3">
            {authMode === 'signup' && (
              <div className="flex flex-col gap-1">
                <label className="text-[12px] font-bold text-[var(--ink)]">
                  {t('fullName')}
                </label>
                <div className="relative flex items-center">
                  <User className="absolute left-3 w-4 h-4 text-[var(--ink-soft)] pointer-events-none" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Elena Wood"
                    className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl pl-9 pr-3 py-2.5 text-[14px] focus:outline-none focus:border-[var(--lagoon)]"
                  />
                </div>
              </div>
            )}

            {/* In Admin Mode: EMAIL IS MASKED */}
            {authMode === 'temporary' ? (
              <div className="flex flex-col gap-1">
                <label className="text-[12px] font-bold text-[var(--ink)]">Temporary access code</label>
                <input
                  type="text"
                  required
                  autoComplete="one-time-code"
                  value={temporaryCode}
                  onChange={(e) => setTemporaryCode(e.target.value.toUpperCase())}
                  placeholder="RW-C-XXXXXX-XXXXXX-XXXXXX"
                  className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl px-3 py-2.5 text-[14px] font-mono tracking-wide focus:outline-none focus:border-[var(--lagoon)]"
                />
                <p className="text-[11px] text-[var(--ink-soft)]">Use one of the temporary customer or supplier codes provided by the administrator.</p>
              </div>
            ) : authMode === 'admin' ? (
              <div className="flex flex-col gap-1">
                <label className="text-[12px] font-bold text-[var(--ink)] flex items-center justify-between">
                  <span>Administrator Account</span>
                  <span className="text-[11px] font-extrabold text-[var(--palm)] uppercase">Masked Identity</span>
                </label>
                <div className="relative flex items-center bg-[var(--surface-2)] border border-[var(--line)] rounded-xl px-3 py-2.5">
                  <Shield className="w-4 h-4 text-[var(--palm)] mr-2 shrink-0" />
                  <span className="font-mono text-[13.5px] text-[var(--ink)] font-bold">
                    {getMaskedAdminEmail()}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <label className="text-[12px] font-bold text-[var(--ink)]">Email</label>
                <div className="relative flex items-center">
                  <Mail className="absolute left-3 w-4 h-4 text-[var(--ink-soft)] pointer-events-none" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl pl-9 pr-3 py-2.5 text-[14px] focus:outline-none focus:border-[var(--lagoon)]"
                  />
                </div>
              </div>
            )}

            {authMode === 'login' && (
              <div className="flex justify-end -mt-1">
                <a href={LEGAL_WORKER_URL + '/reset-password'} target="_blank" rel="noopener noreferrer"
                  className="text-[12px] font-semibold text-[var(--lagoon)] underline underline-offset-2">
                  {lang === 'es' ? '¿Olvidaste tu contraseña?' : 'Forgot password?'}
                </a>
              </div>
            )}

            {authMode !== 'temporary' && (
              <div className="flex flex-col gap-1">
                <label className="text-[12px] font-bold text-[var(--ink)] flex items-center justify-between">
                  <span>{authMode === 'admin' ? 'Supabase Saved Password *' : 'Password'}</span>
                  {authMode === 'admin' && (
                    <span className="text-[10.5px] text-[var(--bloom)] font-semibold">Strict Verification</span>
                  )}
                </label>
                <div className="relative flex items-center">
                  <Key className="absolute left-3 w-4 h-4 text-[var(--ink-soft)] pointer-events-none" />
                  <input
                    type="password"
                    required
                    minLength={authMode === 'signup' ? 8 : 6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl pl-9 pr-3 py-2.5 text-[14px] focus:outline-none focus:border-[var(--lagoon)]"
                  />
                </div>
              </div>
  
  
            )}
            {authError && (
              <div className="flex items-start gap-2 text-[12.5px] text-red-600 bg-red-50 p-2.5 rounded-xl font-medium">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{authError}</span>
              </div>
            )}

            {authSuccessMsg && (
              <p className="text-[12.5px] text-emerald-700 bg-emerald-50 p-2.5 rounded-xl font-medium">
                {authSuccessMsg}
              </p>
            )}

            <button
              type="submit"
              disabled={authLoading}
              className="w-full min-h-[46px] bg-[var(--palm)] hover:bg-[var(--palm)]/90 text-white font-extrabold text-[14.5px] rounded-2xl shadow-xs active:scale-98 transition-all disabled:opacity-60 mt-1"
            >
              {authLoading
                ? 'Verifying with Supabase…'
                : authMode === 'signup'
                ? t('createAcc')
                : authMode === 'admin'
                ? 'Verify Password & Access Admin Studio'
                : authMode === 'temporary'
                ? 'Enter temporary workspace'
                : t('logIn')}
            </button>
          </form>

          {/* Guest Shopping Option */}
          <div className="pt-2 border-t border-[var(--line)] text-center">
            <button
              type="button"
              onClick={onGuestContinue}
              className="text-[13px] font-bold text-[var(--ink-soft)] hover:text-[var(--ink)] py-1.5 transition-all"
            >
              {t('continueGuest')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
