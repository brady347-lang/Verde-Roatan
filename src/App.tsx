import { checkForAppUpdate, AppUpdateInfo } from './lib/appUpdate';
import { LandscaperQuoteForm } from './components/LandscaperQuoteForm';
import React, { useEffect, useRef, useState } from 'react';
import { putPhoto, deletePhoto, migrateGardenPhotos, requestPersistentStorage, safeSetItem } from './lib/photoStore';
import {
  AIAnalysisResult,
  ActiveOrder,
  AuthSession,
  CanonicalOrderStatus,
  CartItem,
  CatalogItem,
  DeliveryZone,
  GardenItem,
  Landscaper,
  Language,
  NotificationEvent,
  OrderCheckoutResult,
  OrderMessage,
  OrderStatusHistoryEntry,
  RegisteredSupplier,
  SupplierPurchaseRequest,
  TransactionRecord
} from './types';
import {
  INITIAL_CATALOG,
  INITIAL_LANDSCAPERS,
  INITIAL_REGISTERED_SUPPLIERS,
  ROATAN_DELIVERY_ZONES,
  STRINGS,
  checkAdminIdentity
} from './data/initialData';
import {
  BchRateResponse,
  analyzeBotanicalImage,
  saveCatalogItem,
  CatalogSaveError,
  deleteCatalogItem,
  updateCatalogStock,
  uploadCatalogPhoto,
  fetchBchRate,
  fetchCatalog,
  fetchAdminOrders,
  fetchCustomerOrders,
  fetchAdminTransactions,
  fetchDeliveryZones,
  refineBotanicalIdentification,
  submitOrderCheckout,
  submitIdentificationFeedback,
  supabaseAuthRequest,
  supabaseRpcRequest,
  refreshSupabaseSession,
  verifySupabaseUser
} from './services/api';
import {
  ORDER_LIFECYCLE_STATUS_LABELS,
  createNotificationEvent,
  createTransactionRecord,
  loadSavedNotifications,
  loadSavedOrders,
  loadSavedSupplierRequests,
  loadSavedTransactions,
  saveNotifications,
  saveOrders,
  saveSupplierRequests,
  saveTransactions
} from './services/orderSystem';
import { Header } from './components/Header';
import { CurrencyWidget } from './components/CurrencyWidget';
import { Navigation, TabType } from './components/Navigation';
import { BottomSheet } from './components/BottomSheet';
import { HomeScreen } from './screens/HomeScreen';
import { ShopScreen } from './screens/ShopScreen';
import { IdentifyScreen } from './screens/IdentifyScreen';
import { ServicesScreen } from './screens/ServicesScreen';
import { DeliveryScreen } from './screens/DeliveryScreen';
import { AccountScreen } from './screens/AccountScreen';
import { PlantEditModal } from './components/PlantEditModal';
import { ProductEditModal } from './components/ProductEditModal';
import { LandscaperEditModal } from './components/LandscaperEditModal';
import { ConfirmDeleteModal } from './components/ConfirmDeleteModal';
import { SpecialSourcingModal } from './components/SpecialSourcingModal';
import { TransportFeeModal } from './components/TransportFeeModal';
import { GardenAdvisorModal } from './components/GardenAdvisorModal';
import { AnimatePresence, motion } from 'motion/react';
import {
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  Droplets,
  Edit2,
  Flower2,
  Info,
  MapPin,
  Minus,
  Palmtree,
  Plus,
  Send,
  Shovel,
  Sparkles,
  Sprout,
  Sun,
  Trash2
} from 'lucide-react';

const TAB_ORDER: TabType[] = ['home', 'plants', 'id', 'svc', 'request', 'account'];

export default function App() {
  // --- Persistent State ---
  const [lang, setLang] = useState<Language>(() => {
    return (localStorage.getItem('verde_lang') as Language) || 'en';
  });
  const [tab, setTab] = useState<TabType>('home');
  const prevTabRef = useRef<TabType>(tab);
  const prevIdx = TAB_ORDER.indexOf(prevTabRef.current);
  const currentIdx = TAB_ORDER.indexOf(tab);
  const slideDirection = currentIdx >= prevIdx ? 1 : -1;

  useEffect(() => {
    prevTabRef.current = tab;
  }, [tab]);
  const [selectedZoneId, setSelectedZoneId] = useState<string>(() => {
    return localStorage.getItem('verde_zone_id') || 'z-we';
  });
  const [currency, setCurrency] = useState<'HNL' | 'USD'>('HNL');
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('verde_cart') || '[]');
    } catch {
      return [];
    }
  });
  const [garden, setGarden] = useState<GardenItem[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('verde_garden') || '[]');
    } catch {
      return [];
    }
  });
  const [customImages, setCustomImages] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem('verde_custom_images') || '{}');
    } catch {
      return {};
    }
  });

  // --- Dynamic Data (Persisted to localStorage) ---
  const [catalog, setCatalog] = useState<CatalogItem[]>(() => {
    try {
      const saved = localStorage.getItem('verde_catalog');
      return saved ? JSON.parse(saved) : INITIAL_CATALOG;
    } catch {
      return INITIAL_CATALOG;
    }
  });

  const [landscapers, setLandscapers] = useState<Landscaper[]>(() => {
    try {
      const saved = localStorage.getItem('verde_landscapers');
      return saved ? JSON.parse(saved) : INITIAL_LANDSCAPERS;
    } catch {
      return INITIAL_LANDSCAPERS;
    }
  });

  const [registeredSuppliers, setRegisteredSuppliers] = useState<RegisteredSupplier[]>(() => {
    try {
      const saved = localStorage.getItem('verde_suppliers');
      return saved ? JSON.parse(saved) : INITIAL_REGISTERED_SUPPLIERS;
    } catch {
      return INITIAL_REGISTERED_SUPPLIERS;
    }
  });

  const [zones, setZones] = useState<DeliveryZone[]>(() => {
    try {
      const saved = localStorage.getItem('verde_delivery_zones');
      return saved ? JSON.parse(saved) : ROATAN_DELIVERY_ZONES;
    } catch {
      return ROATAN_DELIVERY_ZONES;
    }
  });

  const [isTransportFeeModalOpen, setIsTransportFeeModalOpen] = useState(false);
  const [editingZoneId, setEditingZoneId] = useState<string>('z-we');
  const [isGardenAdvisorOpen, setIsGardenAdvisorOpen] = useState(false);

  const handleUpdateZoneFee = (zoneId: string, newFee: number, newCurrency: 'USD' | 'HNL' = 'USD') => {
    setZones((prev) => {
      const updated = prev.map((z) => {
        if (z.id === zoneId) {
          return { ...z, fee: newFee, currency: newCurrency };
        }
        return z;
      });
      try {
        localStorage.setItem('verde_delivery_zones', JSON.stringify(updated));
      } catch (e) {
        console.warn('Failed saving delivery zones to localStorage', e);
      }
      return updated;
    });
    showToast(lang === 'es' ? 'Tarifa de transporte actualizada' : 'Transport fee updated successfully');
  };

  const handleOpenTransportFeeModal = (zoneId?: string) => {
    if (zoneId) setEditingZoneId(zoneId);
    else setEditingZoneId(selectedZoneId || 'z-we');
    setIsTransportFeeModalOpen(true);
  };
  const [rateData, setRateData] = useState<BchRateResponse | null>(null);
  const [isCurrencyWidgetOpen, setIsCurrencyWidgetOpen] = useState(true);

  // --- Auth Session (Strictly verified via Supabase) ---
  const [session, setSession] = useState<AuthSession | null>(() => {
    try {
      const saved = localStorage.getItem('verde_auth_session');
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      // Clean up any insecure fake token
      if (parsed?.access_token === 'local-admin-token') {
        localStorage.removeItem('verde_auth_session');
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  });

  // STRICT ADMIN PERMISSION: Only true if user authenticated with Supabase password
  const isAdmin = Boolean(
    session?.user?.email &&
    checkAdminIdentity(session.user.email) &&
    session?.access_token &&
    session.access_token.length > 20 &&
    session.access_token !== 'local-admin-token'
  );

  // Clean up legacy bypass flag on mount
  useEffect(() => {
    localStorage.removeItem('verde_is_admin');
  }, []);

  // Restore only a session that Supabase still recognizes; refresh before expiry when possible.
  useEffect(() => {
    let cancelled = false;
    const restoreSession = async () => {
      if (!session?.access_token) return;
      try {
        let activeSession = session;
        const expiresAt = Number(session.expires_at || 0);
        if (session.refresh_token && (!expiresAt || expiresAt <= Math.floor(Date.now() / 1000) + 60)) {
          const refreshed = await refreshSupabaseSession(session.refresh_token);
          if (!refreshed?.access_token) throw new Error('Session refresh failed.');
          activeSession = {
            access_token: refreshed.access_token,
            refresh_token: refreshed.refresh_token || session.refresh_token,
            expires_at: Math.floor(Date.now() / 1000) + Number(refreshed.expires_in || 3600),
            user: {
              id: refreshed.user?.id || session.user.id,
              email: refreshed.user?.email || session.user.email,
              full_name: refreshed.user?.user_metadata?.full_name || session.user.full_name
            }
          };
        }
        const verifiedUser = await verifySupabaseUser(activeSession.access_token);
        if (cancelled) return;
        const verifiedSession = {
          ...activeSession,
          user: {
            id: verifiedUser.id || activeSession.user.id,
            email: verifiedUser.email || activeSession.user.email,
            full_name: verifiedUser.user_metadata?.full_name || activeSession.user.full_name
          }
        };
        setSession(verifiedSession);
        safeSetItem('verde_auth_session', JSON.stringify(verifiedSession));
      } catch (error) {
        if (cancelled) return;
        setSession(null);
        localStorage.removeItem('verde_auth_session');
        console.info('Stored Supabase session was no longer valid; user signed out locally.', error);
      }
    };
    restoreSession();
    return () => { cancelled = true; };
  // Run once on app startup; subsequent sign-ins create a fresh verified session.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Identify State ---
  const [identifyMode, setIdentifyMode] = useState<'plant' | 'pest'>('plant');
  const [identifyLoading, setIdentifyLoading] = useState(false);
  const [identifyPhoto, setIdentifyPhoto] = useState<string | null>(null);
  const [identifyResult, setIdentifyResult] = useState<AIAnalysisResult | null>(null);
  const [identifyError, setIdentifyError] = useState<string | null>(null);
  const [isRefiningSpecimen, setIsRefiningSpecimen] = useState(false);

  // --- Checkout & Orders State (Persistent Tracking & History) ---
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [orderResult, setOrderResult] = useState<OrderCheckoutResult | null>(null);

  const [activeOrders, setActiveOrders] = useState<ActiveOrder[]>(() => {
    try {
      const saved = localStorage.getItem('verde_active_orders');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
      return loadSavedOrders();
    } catch {
      return loadSavedOrders();
    }
  });

  const [orderHistory, setOrderHistory] = useState<ActiveOrder[]>(() => {
    try {
      const saved = localStorage.getItem('verde_order_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [transactions, setTransactions] = useState<TransactionRecord[]>(() => {
    return loadSavedTransactions();
  });

  const [supplierRequests, setSupplierRequests] = useState<SupplierPurchaseRequest[]>(() => {
    return loadSavedSupplierRequests();
  });

  const [notifications, setNotifications] = useState<NotificationEvent[]>(() => {
    return loadSavedNotifications();
  });

  // Persistent Storage Sync
  useEffect(() => {
    try {
      localStorage.setItem('verde_active_orders', JSON.stringify(activeOrders));
      saveOrders(activeOrders);
    } catch (e) {
      console.warn('Failed saving active orders', e);
    }
  }, [activeOrders]);

  useEffect(() => {
    try {
      localStorage.setItem('verde_order_history', JSON.stringify(orderHistory));
    } catch (e) {
      console.warn('Failed saving order history', e);
    }
  }, [orderHistory]);

  useEffect(() => {
    saveTransactions(transactions);
  }, [transactions]);

  useEffect(() => {
    saveSupplierRequests(supplierRequests);
  }, [supplierRequests]);

  useEffect(() => {
    saveNotifications(notifications);
  }, [notifications]);

  const [specialSourcingModal, setSpecialSourcingModal] = useState<{
    isOpen: boolean;
    plantName: string;
    scientificName?: string;
  }>({ isOpen: false, plantName: '' });

  // --- Modal Sheets ---
  const [activeModal, setActiveModal] = useState<
    | null
    | { type: 'item-details'; item: CatalogItem }
    | { type: 'zone-picker' }
    | { type: 'quote-request'; crew: Landscaper }
  >(null);

  // Dedicated Admin CRUD Modals
  const [plantModal, setPlantModal] = useState<{ isOpen: boolean; plant: CatalogItem | null }>({
    isOpen: false,
    plant: null
  });
  const [productModal, setProductModal] = useState<{ isOpen: boolean; product: CatalogItem | null }>({
    isOpen: false,
    product: null
  });
  const [landscaperModal, setLandscaperModal] = useState<{ isOpen: boolean; landscaper: Landscaper | null }>({
    isOpen: false,
    landscaper: null
  });
  const [confirmDelete, setConfirmDelete] = useState<{
    isOpen: boolean;
    title: string;
    itemName: string;
    itemType: 'plant' | 'product' | 'landscaper';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    itemName: '',
    itemType: 'plant',
    onConfirm: () => {}
  });

  const [sheetQty, setSheetQty] = useState(1);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [shopSearchInit, setShopSearchInit] = useState('');

  // Translations shortcut
  const t = (k: string) => STRINGS[lang]?.[k] || STRINGS.en[k] || k;

  // --- Show Toast ---
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((curr) => (curr === msg ? null : curr));
    }, 2800);
  };

  // --- Language Toggle ---
  const toggleLanguage = () => {
    const next = lang === 'en' ? 'es' : 'en';
    setLang(next);
    safeSetItem('verde_lang', next);
    showToast(next === 'es' ? 'Idioma: Español' : 'Language: English');
  };

  // --- One-time migration: move legacy base64 garden photos out of localStorage into IndexedDB ---
  useEffect(() => {
    requestPersistentStorage();
    let cancelled = false;
    (async () => {
      if (!garden.some((g) => typeof g.photo === 'string' && g.photo.startsWith('data:image/'))) return;
      const migrated = await migrateGardenPhotos(garden);
      if (cancelled) return;
      // Merge by id so anything saved while migrating is not lost.
      setGarden((current) =>
        current.map((g) => {
          const m = migrated.find((x) => x.id === g.id);
          return m && m.photoId ? { ...g, photo: null, photoId: m.photoId } : g;
        })
      );
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Save persistent effects ---
  useEffect(() => {
    safeSetItem('verde_cart', JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    safeSetItem('verde_garden', JSON.stringify(garden));
  }, [garden]);

  useEffect(() => {
    safeSetItem('verde_catalog', JSON.stringify(catalog));
  }, [catalog]);

  useEffect(() => {
    safeSetItem('verde_landscapers', JSON.stringify(landscapers));
  }, [landscapers]);

  useEffect(() => {
    safeSetItem('verde_suppliers', JSON.stringify(registeredSuppliers));
  }, [registeredSuppliers]);

  useEffect(() => {
    safeSetItem('verde_custom_images', JSON.stringify(customImages));
  }, [customImages]);

  useEffect(() => {
    safeSetItem('verde_zone_id', selectedZoneId);
  }, [selectedZoneId]);

  useEffect(() => {
    safeSetItem('verde_active_orders', JSON.stringify(activeOrders));
  }, [activeOrders]);

  useEffect(() => {
    safeSetItem('verde_order_history', JSON.stringify(orderHistory));
  }, [orderHistory]);

  // Merge custom images into catalog
  const currentCatalog = catalog.map((item) => {
    if (customImages[item.id]) {
      return { ...item, image_url: customImages[item.id] };
    }
    return item;
  });

  // The details window must follow the live catalog so a changed photo/price shows immediately.
  const detailItem =
    activeModal?.type === 'item-details'
      ? currentCatalog.find((c) => String(c.id) === String(activeModal.item.id)) || activeModal.item
      : null;

  // --- Initial Data Fetching ---
  useEffect(() => {
    fetchBchRate().then((res) => setRateData(res));
    fetchDeliveryZones().then((res) => {
      if (res && res.length) setZones(res);
    });

    // Refresh the catalog from the existing API worker on every app launch.
    fetchCatalog().then((res) => {
      if (Array.isArray(res)) {
        // Keep locally cached photos for matching records when the API response omits image_url.
        // Also retain locally created draft items; these are not yet synced to the catalog API.
        setCatalog((previousCatalog) => {
          const previousById = new Map(previousCatalog.map((item) => [String(item.id), item]));
          const remoteIds = new Set(res.map((item) => String(item.id)));
          const mergedRemote = res.map((remoteItem) => {
            const previousItem = previousById.get(String(remoteItem.id));
            return {
              ...previousItem,
              ...remoteItem,
              image_url: remoteItem.image_url || previousItem?.image_url || ''
            };
          });
          const localDrafts = previousCatalog.filter((item) =>
            !remoteIds.has(String(item.id)) &&
            (String(item.id).startsWith('p-') || String(item.id).startsWith('prd-'))
          );
          return [...localDrafts, ...mergedRemote];
        });
      }
    }).catch((error) => {
      console.warn('Live catalog refresh skipped; keeping the last saved catalog.', error);
    });

    const interval = setInterval(() => {
      fetchBchRate().then((res) => setRateData(res));
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Admin command center reads the real order ledger from Supabase after admin authentication.
  useEffect(() => {
    if (!isAdmin || !session?.access_token) return;
    let cancelled = false;
    fetchAdminOrders(session.access_token).then((remoteOrders) => {
      if (cancelled) return;
      const active = remoteOrders.filter((order) => !['delivered', 'completed', 'cancelled', 'refunded'].includes(String(order.canonical_status)));
      const archived = remoteOrders.filter((order) => ['delivered', 'completed', 'cancelled', 'refunded'].includes(String(order.canonical_status)));
      setActiveOrders(active);
      setOrderHistory(archived);
    }).catch((error) => {
      console.warn('Supabase admin order sync unavailable; retaining locally cached records.', error);
    });
    fetchAdminTransactions(session.access_token).then((remoteTransactions) => {
      if (!cancelled) setTransactions(remoteTransactions);
    }).catch((error) => {
      console.warn('Supabase transaction ledger is not readable for this session; retaining local records.', error);
    });
    return () => { cancelled = true; };
  }, [isAdmin, session?.access_token]);

  // Customer order history is loaded from Supabase after a verified customer sign-in.
  // The database's customer RLS policies restrict this query to auth.uid() = customer_id.
  useEffect(() => {
    if (!session?.access_token || isAdmin) return;
    let cancelled = false;
    fetchCustomerOrders(session.access_token).then((remoteOrders) => {
      if (cancelled) return;
      const active = remoteOrders.filter((order) => !['delivered', 'completed', 'cancelled', 'refunded'].includes(String(order.canonical_status)));
      const archived = remoteOrders.filter((order) => ['delivered', 'completed', 'cancelled', 'refunded'].includes(String(order.canonical_status)));
      setActiveOrders(active);
      setOrderHistory(archived);
    }).catch((error) => {
      console.warn('Customer order sync unavailable; retaining locally cached records.', error);
    });
    return () => { cancelled = true; };
  }, [isAdmin, session?.access_token]);

  // New APK available? (Android app only; silent when offline or current.)
  const [appUpdate, setAppUpdate] = useState<AppUpdateInfo | null>(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    checkForAppUpdate().then((info) => { if (!cancelled) setAppUpdate(info); });
    return () => { cancelled = true; };
  }, []);

  // Selected Zone
  const currentZone = zones.find((z) => z.id === selectedZoneId) || zones[0];

  // Cart count
  const cartCount = cart.reduce((acc, c) => acc + c.qty, 0);

  // --- Currency Formatting Utility ---
  const formatMoney = (amount: number, fromCurrency: string = 'HNL') => {
    const num = Number(amount) || 0;
    const rate = rateData?.hnlPerUsd || 26;

    // Primary
    const primary = new Intl.NumberFormat(fromCurrency === 'HNL' ? 'es-HN' : 'en-US', {
      style: 'currency',
      currency: fromCurrency,
      maximumFractionDigits: 2
    }).format(num);

    // Secondary converted
    const secondaryCur = fromCurrency === 'HNL' ? 'USD' : 'HNL';
    const secondaryNum = fromCurrency === 'HNL' ? num / rate : num * rate;
    const secondary = new Intl.NumberFormat(secondaryCur === 'HNL' ? 'es-HN' : 'en-US', {
      style: 'currency',
      currency: secondaryCur,
      maximumFractionDigits: 2
    }).format(secondaryNum);

    return (
      <span className="inline-block tabular-nums">
        <span>{primary}</span>{' '}
        <small className="text-[11px] font-normal text-[var(--ink-soft)] opacity-85 ml-0.5">
          ≈ {secondary}
        </small>
      </span>
    );
  };

  // --- Cart Actions ---
  const handleAddToCart = (id: string, qty: number = 1) => {
    setCart((prev) => {
      const idx = prev.findIndex((c) => String(c.id) === String(id));
      if (idx >= 0) {
        const next = [...prev];
        next[idx].qty += qty;
        return next;
      }
      return [...prev, { id: String(id), qty }];
    });
    showToast(lang === 'es' ? 'Agregado a la entrega' : 'Added to delivery request');
  };

  const handleUpdateQty = (id: string, delta: number) => {
    setCart((prev) => {
      return prev
        .map((item) => {
          if (String(item.id) === String(id)) {
            return { ...item, qty: item.qty + delta };
          }
          return item;
        })
        .filter((item) => item.qty > 0);
    });
  };

  const handleRemoveFromCart = (id: string) => {
    setCart((prev) => prev.filter((item) => String(item.id) !== String(id)));
  };

  // --- AI Identification Action ---
  const handleAnalyzeSpecimen = async (base64Photo: string) => {
    setIdentifyPhoto(base64Photo);
    setIdentifyLoading(true);
    setIdentifyError(null);
    setIdentifyResult(null);
    setIsRefiningSpecimen(false);

    try {
      const res = await analyzeBotanicalImage(
        identifyMode,
        base64Photo,
        lang,
        session?.access_token
      );
      setIdentifyResult(res);
      setIdentifyLoading(false);

      // Trigger continuous accuracy refinement after the 8-second search / initial diagnosis
      if (res && res.status === 'success' && (res.verified_botanical_record || res.result || res.candidates)) {
        setIsRefiningSpecimen(true);
        refineBotanicalIdentification(
          identifyMode,
          base64Photo,
          res,
          lang,
          session?.access_token
        )
          .then((refined) => {
            if (refined && refined.status === 'success') {
              setIdentifyResult((prev) => {
                if (!prev) return refined;
                return {
                  ...prev,
                  ...refined,
                  is_refined: true,
                  refinement_stage: 'verified',
                  verified_botanical_record: refined.verified_botanical_record || prev.verified_botanical_record,
                  result: refined.result || prev.result,
                  candidates: refined.candidates || prev.candidates
                };
              });
            }
          })
          .catch((err) => {
            console.warn('Continuous refinement background notice:', err);
          })
          .finally(() => {
            setIsRefiningSpecimen(false);
          });
      }
    } catch (err: any) {
      setIdentifyError(err.message || 'Analysis could not be completed.');
      setIdentifyLoading(false);
    }
  };

  const handleSubmitIdentificationFeedback = async (
    decision: 'confirmed' | 'almost' | 'not_my_plant',
    correctedCommonName = '',
    correctedScientificName = '',
    notes = ''
  ) => {
    if (!identifyPhoto || !identifyResult) {
      throw new Error('Analyze a plant photo before submitting feedback.');
    }
    if (!session?.access_token) {
      throw new Error('Please sign in to confirm or correct plant identifications.');
    }
    await submitIdentificationFeedback(
      identifyMode,
      identifyPhoto,
      identifyResult,
      decision,
      correctedCommonName,
      correctedScientificName,
      session.access_token,
      notes,
      lang
    );
    showToast(
      lang === 'es'
        ? '¡Gracias! Tu confirmación se guardó para revisión botánica.'
        : 'Thank you! Your feedback was saved for botanical review.'
    );
  };

  const handleDeepRefreshSpecimen = async () => {
    if (!identifyPhoto || !identifyResult) return;
    setIsRefiningSpecimen(true);
    try {
      const refined = await refineBotanicalIdentification(
        identifyMode,
        identifyPhoto,
        identifyResult,
        lang,
        session?.access_token
      );
      if (refined && refined.status === 'success') {
        setIdentifyResult(refined);
        showToast(
          lang === 'es'
            ? '¡Precisión botánica optimizada y actualizada!'
            : 'Botanical accuracy refined & updated!'
        );
      }
    } catch (err: any) {
      showToast(err.message || 'Refinement refresh failed');
    } finally {
      setIsRefiningSpecimen(false);
    }
  };

  const handleSaveToGarden = async () => {
    if (!identifyResult) return;
    let name = 'Plant Specimen';
    if (identifyResult.verified_botanical_record) {
      name = identifyResult.verified_botanical_record.common_name;
    } else if (identifyResult.candidates?.[0]) {
      name = identifyResult.candidates[0].common_name;
    } else if (identifyResult.result?.primary_diagnosis) {
      name = identifyResult.result.primary_diagnosis;
    }

    const id = `g_${Date.now()}`;
    // Photos go to IndexedDB (binary, large quota). Only the small id is kept in app state / localStorage.
    let photoId: string | null = null;
    let photoFailed = false;
    if (identifyPhoto) {
      try {
        photoId = await putPhoto(id, identifyPhoto);
      } catch (err) {
        console.error('Could not store garden photo:', err);
        photoFailed = true;
      }
    }

    const entry: GardenItem = {
      id,
      date: new Date().toLocaleDateString(lang === 'es' ? 'es-HN' : 'en-US'),
      mode: identifyMode,
      name,
      photo: null,
      photoId,
      data: identifyResult
    };

    setGarden((prev) => [entry, ...prev]);
    showToast(
      photoFailed
        ? (lang === 'es' ? 'Guardado, pero la foto no se pudo almacenar.' : 'Saved, but the photo could not be stored on this device.')
        : t('savedToGarden')
    );
  };

  const handleRemoveGardenItem = (id: string) => {
    setGarden((prev) => prev.filter((g) => g.id !== id));
    deletePhoto(id).catch((err) => console.warn('Could not delete stored photo', err));
    showToast('Item removed from My Garden');
  };

  // --- Checkout Action (Creates Persistent Active Order, Transaction Record, Supplier Request & Notification) ---
  const handleSubmitCheckout = async (details: {
    name: string;
    phone: string;
    address: string;
    notes: string;
    timing: string;
    currency: 'HNL' | 'USD';
    consent: boolean;
  }) => {
    setIsSubmittingOrder(true);
    try {
      const res = await submitOrderCheckout(
        {
          checkout_token: crypto.randomUUID(),
          customer_name: details.name,
          customer_phone: details.phone,
          delivery_zone_id: selectedZoneId,
          delivery_address: details.address,
          notes: `${details.notes}\nPreferred Timing: ${details.timing}`,
          currency: details.currency,
          marketing_consent: details.consent,
          items: cart.map((c) => ({ product_id: c.id, quantity: c.qty }))
        },
        session?.access_token
      );

      const zone = zones.find((z) => z.id === selectedZoneId) || zones[0];
      const itemsList = cart.map((ci) => {
        const it = currentCatalog.find((c) => String(c.id) === String(ci.id));
        return {
          id: ci.id,
          name: it?.name || 'Island Specimen',
          price: it?.price || 250,
          currency: it?.currency || details.currency,
          qty: ci.qty,
          size: it?.size,
          image_url: it?.image_url,
          supplier_name: it?.nursery
        };
      });

      const sub = itemsList.reduce((acc, it) => acc + it.price * it.qty, 0);
      const fee = zone ? zone.fee : 100;
      const orderCode = String(res?.order_id || res?.id || '').trim();
      if (!orderCode) throw new Error('The server did not return a confirmed order number. Your cart has been kept intact.');
      const activeExchangeRate = rateData?.hnlPerUsd || 26;

      // Identify primary nursery / supplier
      const firstNurseryName = itemsList[0]?.supplier_name;
      const matchingSupplier = registeredSuppliers.find(
        (s) => s.name.toLowerCase() === firstNurseryName?.toLowerCase()
      ) || registeredSuppliers[0];

      const estSupplierCost = Math.round(sub * 0.6);

      const newOrder: ActiveOrder = {
        id: `ord_${Date.now()}`,
        order_id: orderCode,
        created_at: new Date().toISOString(),
        items: itemsList,
        customer_name: details.name,
        phone: details.phone,
        address: details.address,
        zone_id: selectedZoneId,
        zone_name: zone?.name || 'Roatan',
        timing: details.timing,
        notes: details.notes,
        currency: details.currency,
        subtotal: sub,
        delivery_fee: fee,
        total: sub + fee,
        status: 'placed',
        canonical_status: 'order_placed',
        payment_status: 'pending',
        payment_method: 'card_pos',
        delivery_type: 'island_delivery',
        exchange_rate_used: activeExchangeRate,
        assigned_supplier_id: matchingSupplier?.id || 'sup-1',
        assigned_supplier_name: matchingSupplier?.name || 'Verde Roatán Nursery (Sandy Bay)',
        supplier_cost: estSupplierCost,
        supplier_cost_currency: details.currency,
        supplier_paid: false,
        status_history: [
          {
            id: `sh-${Date.now()}-1`,
            new_status: 'order_placed',
            timestamp: new Date().toISOString(),
            responsible_role: 'customer',
            responsible_name: details.name,
            notes: `Customer placed order online for ${zone?.name || 'Roatan'}`
          }
        ],
        messages: [
          {
            id: `msg-${Date.now()}-1`,
            order_id: orderCode,
            sender_role: 'admin',
            sender_name: 'Verde Order Desk',
            recipient_role: 'customer',
            message: `Order #${orderCode} received! We are coordinating nursery pickup & delivery to ${zone?.name || 'Roatan'}.`,
            timestamp: new Date().toISOString()
          }
        ]
      };

      // 1. Record customer order transaction
      const orderTxn = createTransactionRecord({
        related_order_id: orderCode,
        type: 'customer_order',
        customer_name: details.name,
        supplier_name: newOrder.assigned_supplier_name,
        amount: newOrder.total,
        currency: details.currency,
        exchange_rate: activeExchangeRate,
        payment_method: 'card_pos',
        status: 'pending',
        responsible_role: 'customer',
        responsible_name: details.name,
        notes: `New customer order with ${itemsList.length} items (${newOrder.zone_name})`,
        reference_number: orderCode
      });
      setTransactions((prev) => [orderTxn, ...prev]);

      // 2. Create Administrator Notification for Customer Event
      const adminNotif = createNotificationEvent({
        category: 'customer',
        event_type: 'order_placed',
        related_order_id: orderCode,
        entity_name: details.name,
        title: `New Order #${orderCode} Placed`,
        description: `${details.name} ordered ${itemsList.length} specimen(s) for ${details.currency} ${newOrder.total.toLocaleString()}. Zone: ${newOrder.zone_name}`,
        priority: 'high'
      });
      setNotifications((prev) => [adminNotif, ...prev]);

      // 3. Automatically generate Supplier Purchase Request for assigned grower
      const supItems: SupplierPurchaseRequest['items'] = itemsList.map((it, idx) => ({
        id: `spi-${Date.now()}-${idx}`,
        product_id: it.id,
        name: it.name,
        quantity: it.qty,
        unit_price: Math.round(it.price * 0.6),
        currency: details.currency,
        status: 'pending' as const,
        notes: it.size ? `Specimen size: ${it.size}` : undefined
      }));

      const totalSupCost = supItems.reduce((acc, it) => acc + it.unit_price * it.quantity, 0);

      const supReq: SupplierPurchaseRequest = {
        id: `req-${Date.now()}`,
        order_id: orderCode,
        supplier_id: matchingSupplier?.id || 'sup-1',
        supplier_name: matchingSupplier?.name || 'Verde Roatán Nursery (Sandy Bay)',
        supplier_location: matchingSupplier?.location || 'Roatán, Bay Islands',
        items: supItems,
        total_supplier_cost: totalSupCost,
        currency: details.currency,
        payment_status: 'unpaid',
        status: 'pending_confirmation',
        estimated_prep_hours: 4,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        supplier_notes: `Purchase request generated automatically for Order #${orderCode}. Delivery destination: ${zone?.name || 'Roatan'}`
      };
      setSupplierRequests((prev) => [supReq, ...prev]);

      // 4. Create Supplier Event Notification
      const supNotif = createNotificationEvent({
        category: 'supplier',
        event_type: 'purchase_request_created',
        related_order_id: orderCode,
        entity_name: supReq.supplier_name,
        title: `Supplier Purchase Request #${orderCode}`,
        description: `Purchase order queued for ${supReq.supplier_name} with ${itemsList.length} requested items.`,
        priority: 'normal'
      });
      setNotifications((prev) => [supNotif, ...prev]);

      setActiveOrders((prev) => [newOrder, ...prev]);
      setOrderResult(res);
      setCart([]);
      showToast(lang === 'es' ? '¡Pedido registrado! Rastreando entrega...' : 'Order registered! Tracking delivery...');
    } catch (err: any) {
      showToast(err.message || 'Order dispatch failed');
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  // --- Customer / Provider Delivery Confirmation ---
  const handleConfirmDelivery = (orderId: string) => {
    setActiveOrders((prev) => {
      const target = prev.find((o) => o.id === orderId || o.order_id === orderId);
      if (!target) return prev;

      const previousStatus = target.canonical_status || 'out_for_delivery';
      const historyEntry: OrderStatusHistoryEntry = {
        id: `sh-${Date.now()}`,
        previous_status: previousStatus,
        new_status: 'delivered',
        timestamp: new Date().toISOString(),
        responsible_role: 'customer',
        responsible_name: target.customer_name,
        notes: 'Customer confirmed on-site arrival and inspection of specimen(s).'
      };

      const completed: ActiveOrder = {
        ...target,
        status: 'delivered',
        canonical_status: 'delivered',
        delivered_at: new Date().toISOString(),
        confirmed_by_customer: true,
        status_history: [...(target.status_history || []), historyEntry]
      };

      // Record operational delivery transaction
      const delTxn = createTransactionRecord({
        related_order_id: target.order_id,
        type: 'delivery_fee',
        customer_name: target.customer_name,
        amount: target.delivery_fee,
        currency: target.currency,
        exchange_rate: target.exchange_rate_used || 26,
        payment_method: target.payment_method || 'card_pos',
        status: 'completed',
        responsible_role: 'customer',
        responsible_name: target.customer_name,
        notes: `Delivery finalized at ${target.zone_name}.`,
        reference_number: target.order_id
      });
      setTransactions((txns) => [delTxn, ...txns]);

      // Create Operational Notification
      const opNotif = createNotificationEvent({
        category: 'operational',
        event_type: 'delivery_confirmed',
        related_order_id: target.order_id,
        entity_name: target.customer_name,
        title: `Order #${target.order_id} Delivered Successfully`,
        description: `Customer ${target.customer_name} confirmed arrival of healthy plants at ${target.zone_name}.`,
        priority: 'high'
      });
      setNotifications((notifs) => [opNotif, ...notifs]);

      setOrderHistory((hist) => [completed, ...hist.filter((h) => h.id !== target.id)]);
      return prev.filter((o) => o.id !== target.id && o.order_id !== target.order_id);
    });

    showToast(lang === 'es' ? '¡Llegada de plantas confirmada! Archivada en historial.' : 'Plant delivery confirmed! Archived in order history.');
  };

  // --- 14-Step Canonical Order Status Advancement & Audit Recording ---
  const handleAdvanceOrderStatus = async (
    orderId: string,
    targetStatus?: CanonicalOrderStatus,
    notes?: string
  ) => {
    const orderForSync = activeOrders.find((order) => order.id === orderId || order.order_id === orderId);
    if (!orderForSync) return;
    const currentForSync = orderForSync.canonical_status || 'order_placed';
    const progression: Partial<Record<CanonicalOrderStatus, CanonicalOrderStatus>> = {
      order_placed: 'payment_confirmed',
      payment_pending: 'payment_confirmed',
      payment_confirmed: 'supplier_confirmed',
      order_processing: 'supplier_confirmed',
      supplier_confirmation_required: 'supplier_confirmed',
      supplier_confirmed: 'preparing_order',
      preparing_order: 'ready_for_pickup',
      ready_for_pickup: 'out_for_delivery',
      out_for_delivery: 'delivered',
      delivered: 'completed'
    };
    const serverNextStatus = targetStatus || progression[currentForSync] || currentForSync;

    // Persist status changes through the existing Supabase RPC before updating the UI.
    if (isAdmin && session?.access_token) {
      try {
        await supabaseRpcRequest('advance_order_status', {
          p_order_id: orderForSync.order_id,
          p_next_status: serverNextStatus,
          p_responsible_role: 'admin',
          p_responsible_name: session.user.full_name || 'Verde Administrator',
          p_notes: notes || null
        }, session.access_token);
      } catch (error: any) {
        showToast(error.message || 'Could not save the order status to Supabase.');
        return;
      }
    } else if (isAdmin) {
      showToast('Your administrator session has expired. Please sign in again.');
      return;
    }

    setActiveOrders((prev) => {
      const target = prev.find((o) => o.id === orderId || o.order_id === orderId);
      if (!target) return prev;

      const currentCanonical = target.canonical_status || 'order_placed';

      // Default progression chain if no specific status was provided
      let nextCanonical: CanonicalOrderStatus = targetStatus || 'order_placed';
      if (!targetStatus) {
        if (currentCanonical === 'order_placed') nextCanonical = 'payment_confirmed';
        else if (currentCanonical === 'payment_pending') nextCanonical = 'payment_confirmed';
        else if (currentCanonical === 'payment_confirmed') nextCanonical = 'supplier_confirmed';
        else if (currentCanonical === 'order_processing') nextCanonical = 'supplier_confirmed';
        else if (currentCanonical === 'supplier_confirmation_required') nextCanonical = 'supplier_confirmed';
        else if (currentCanonical === 'supplier_confirmed') nextCanonical = 'preparing_order';
        else if (currentCanonical === 'preparing_order') nextCanonical = 'ready_for_pickup';
        else if (currentCanonical === 'ready_for_pickup') nextCanonical = 'out_for_delivery';
        else if (currentCanonical === 'out_for_delivery') nextCanonical = 'delivered';
        else if (currentCanonical === 'delivered') nextCanonical = 'completed';
        else nextCanonical = currentCanonical;
      }

      // Map to legacy UI status
      let legacyStatus: ActiveOrder['status'] = 'placed';
      if (['order_placed', 'payment_pending', 'payment_confirmed', 'order_processing'].includes(nextCanonical)) {
        legacyStatus = 'placed';
      } else if (['supplier_confirmation_required', 'supplier_confirmed', 'preparing_order', 'ready_for_pickup'].includes(nextCanonical)) {
        legacyStatus = 'staged';
      } else if (nextCanonical === 'out_for_delivery') {
        legacyStatus = 'en_route';
      } else if (['delivered', 'completed'].includes(nextCanonical)) {
        legacyStatus = 'delivered';
      } else if (['cancelled', 'refund_requested', 'refunded'].includes(nextCanonical)) {
        legacyStatus = 'cancelled';
      }

      const responsibleName = session?.user?.full_name || (isAdmin ? 'Verde Administrator' : 'Dispatch System');
      const responsibleRole: 'admin' | 'system' = isAdmin ? 'admin' : 'system';

      const historyEntry: OrderStatusHistoryEntry = {
        id: `sh-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
        previous_status: currentCanonical,
        new_status: nextCanonical,
        timestamp: new Date().toISOString(),
        responsible_role: responsibleRole,
        responsible_name: responsibleName,
        notes: notes || `Status changed from ${ORDER_LIFECYCLE_STATUS_LABELS[currentCanonical]?.en} to ${ORDER_LIFECYCLE_STATUS_LABELS[nextCanonical]?.en}`
      };

      const updatedOrder: ActiveOrder = {
        ...target,
        status: legacyStatus,
        canonical_status: nextCanonical,
        status_history: [...(target.status_history || []), historyEntry],
        delivered_at: nextCanonical === 'delivered' ? new Date().toISOString() : target.delivered_at,
        payment_status: nextCanonical === 'payment_confirmed' ? 'confirmed' : target.payment_status
      };

      // Record appropriate Financial / Operational Audit Transaction
      let txnType: TransactionRecord['type'] = 'status_change';
      let txnStatus: TransactionRecord['status'] = 'completed';
      let txnAmount = 0;

      if (nextCanonical === 'payment_confirmed') {
        txnType = 'customer_payment';
        txnAmount = target.total;
      } else if (nextCanonical === 'delivered') {
        txnType = 'delivery_fee';
        txnAmount = target.delivery_fee;
      } else if (nextCanonical === 'cancelled') {
        txnType = 'cancellation';
      } else if (nextCanonical === 'refunded') {
        txnType = 'refund';
        txnAmount = target.total;
      }

      const auditTxn = createTransactionRecord({
        related_order_id: target.order_id,
        type: txnType,
        customer_name: target.customer_name,
        supplier_name: target.assigned_supplier_name,
        amount: txnAmount || target.total,
        currency: target.currency,
        exchange_rate: target.exchange_rate_used || 26,
        payment_method: target.payment_method || 'card_pos',
        status: txnStatus,
        responsible_role: responsibleRole,
        responsible_name: responsibleName,
        notes: notes || `Audit event: status moved to ${ORDER_LIFECYCLE_STATUS_LABELS[nextCanonical]?.en}`,
        reference_number: target.order_id
      });
      setTransactions((txns) => [auditTxn, ...txns]);

      // Create Operational/Financial Notification
      const notifCategory = ['payment_confirmed', 'refunded'].includes(nextCanonical)
        ? 'financial'
        : 'operational';

      const notif = createNotificationEvent({
        category: notifCategory,
        event_type: 'order_status_updated',
        related_order_id: target.order_id,
        entity_name: target.customer_name,
        title: `Order #${target.order_id}: ${ORDER_LIFECYCLE_STATUS_LABELS[nextCanonical]?.en}`,
        description: `Lifecycle advanced by ${responsibleName}. Note: ${historyEntry.notes}`,
        priority: ['cancelled', 'refund_requested', 'out_for_delivery'].includes(nextCanonical) ? 'high' : 'normal'
      });
      setNotifications((notifs) => [notif, ...notifs]);

      // If supplier is involved and status moved to ready or confirmed, update supplier request
      if (['supplier_confirmed', 'preparing_order', 'ready_for_pickup'].includes(nextCanonical)) {
        setSupplierRequests((requests) =>
          requests.map((req) => {
            if (req.order_id === target.order_id) {
              return {
                ...req,
                status: nextCanonical === 'ready_for_pickup' ? 'ready_for_pickup' : 'confirmed',
                updated_at: new Date().toISOString()
              };
            }
            return req;
          })
        );
      }

      // If completed or delivered, archive into order history as well
      if (nextCanonical === 'completed') {
        setOrderHistory((hist) => [updatedOrder, ...hist.filter((h) => h.id !== target.id)]);
        showToast('Order completed & fully archived in ledger.');
        return prev.filter((o) => o.id !== target.id);
      }

      showToast(`Status updated: ${ORDER_LIFECYCLE_STATUS_LABELS[nextCanonical]?.en}`);
      return prev.map((o) => (o.id === target.id ? updatedOrder : o));
    });
  };

  // --- Administrator Direct Order Update ---
  const handleUpdateOrder = (updatedOrder: ActiveOrder) => {
    setActiveOrders((prev) =>
      prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o))
    );
    setOrderHistory((prev) =>
      prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o))
    );

    const auditTxn = createTransactionRecord({
      related_order_id: updatedOrder.order_id,
      type: 'order_adjustment',
      customer_name: updatedOrder.customer_name,
      supplier_name: updatedOrder.assigned_supplier_name,
      amount: updatedOrder.total,
      currency: updatedOrder.currency,
      exchange_rate: updatedOrder.exchange_rate_used || 26,
      status: 'completed',
      responsible_role: 'admin',
      responsible_name: session?.user?.full_name || 'Admin',
      notes: `Order details updated by administrator (${updatedOrder.zone_name})`,
      reference_number: updatedOrder.order_id
    });
    setTransactions((txns) => [auditTxn, ...txns]);

    showToast('Order details updated successfully');
  };

  // --- Supplier Interaction: Update Purchase Request Fulfillment ---
  const handleUpdateSupplierRequest = (updatedReq: SupplierPurchaseRequest) => {
    setSupplierRequests((prev) =>
      prev.map((r) => (r.id === updatedReq.id ? updatedReq : r))
    );

    // If supplier confirmed availability or preparation, update matching order
    if (updatedReq.status === 'confirmed' || updatedReq.status === 'ready_for_pickup') {
      const targetCanonical: CanonicalOrderStatus =
        updatedReq.status === 'ready_for_pickup' ? 'ready_for_pickup' : 'supplier_confirmed';

      setActiveOrders((prev) =>
        prev.map((o) => {
          if (o.order_id === updatedReq.order_id) {
            const historyEntry: OrderStatusHistoryEntry = {
              id: `sh-${Date.now()}`,
              previous_status: o.canonical_status || 'supplier_confirmation_required',
              new_status: targetCanonical,
              timestamp: new Date().toISOString(),
              responsible_role: 'supplier',
              responsible_name: updatedReq.supplier_name,
              notes: updatedReq.supplier_notes || `Grower updated fulfillment progress to ${targetCanonical}`
            };
            return {
              ...o,
              canonical_status: targetCanonical,
              status: targetCanonical === 'ready_for_pickup' ? 'staged' : o.status,
              status_history: [...(o.status_history || []), historyEntry]
            };
          }
          return o;
        })
      );
    }

    // Add supplier event notification
    const supNotif = createNotificationEvent({
      category: 'supplier',
      event_type: 'supplier_status_update',
      related_order_id: updatedReq.order_id,
      entity_name: updatedReq.supplier_name,
      title: `Supplier Update: ${updatedReq.supplier_name}`,
      description: `Purchase order #${updatedReq.order_id} status updated to ${updatedReq.status.toUpperCase()}. Est. prep: ${updatedReq.estimated_prep_hours}h.`,
      priority: updatedReq.status === 'rejected' ? 'high' : 'normal'
    });
    setNotifications((prev) => [supNotif, ...prev]);

    showToast('Supplier purchase order updated and synced with order desk.');
  };

  // --- Financial Ledger: Append Auditable Transaction ---
  const handleAddTransaction = (txn: TransactionRecord) => {
    setTransactions((prev) => [txn, ...prev]);
    showToast('Transaction recorded in permanent ledger.');
  };

  // --- Order Communication: Send In-Order Message ---
  const handleSendOrderMessage = (
    orderId: string,
    messageText: string,
    senderRoleOrId: string,
    senderName: string
  ) => {
    if (!messageText.trim()) return;

    const role: OrderMessage['sender_role'] =
      senderRoleOrId === 'supplier'
        ? 'supplier'
        : senderRoleOrId === 'customer'
        ? 'customer'
        : 'admin';

    const recipientRole: OrderMessage['recipient_role'] =
      role === 'customer' || role === 'supplier' ? 'admin' : 'customer';

    const newMsg: OrderMessage = {
      id: `msg-${Date.now()}`,
      order_id: orderId,
      sender_role: role,
      sender_name: senderName,
      recipient_role: recipientRole,
      message: messageText.trim(),
      timestamp: new Date().toISOString()
    };

    setActiveOrders((prev) =>
      prev.map((o) => {
        if (o.order_id === orderId || o.id === orderId) {
          return {
            ...o,
            messages: [...(o.messages || []), newMsg]
          };
        }
        return o;
      })
    );

    setOrderHistory((prev) =>
      prev.map((o) => {
        if (o.order_id === orderId || o.id === orderId) {
          return {
            ...o,
            messages: [...(o.messages || []), newMsg]
          };
        }
        return o;
      })
    );

    // Create notification for recipient
    const notif = createNotificationEvent({
      category: role === 'supplier' ? 'supplier' : 'customer',
      event_type: 'order_message',
      related_order_id: orderId,
      entity_name: senderName,
      title: `Message from ${senderName} on #${orderId}`,
      description: messageText.length > 90 ? `${messageText.slice(0, 90)}…` : messageText,
      priority: 'normal'
    });
    setNotifications((prev) => [notif, ...prev]);

    showToast(lang === 'es' ? 'Mensaje enviado' : 'Message sent');
  };

  // --- Customer Quick Message Handler for DeliveryScreen ---
  const handleSendCustomerMessage = (orderId: string, messageText: string) => {
    const customerName = session?.user?.full_name || 'Customer';
    handleSendOrderMessage(orderId, messageText, 'customer', customerName);
  };

  // --- Notification Center Handlers ---
  const handleMarkNotificationRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
  };

  const handleMarkAllNotificationsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    showToast('All notifications marked as read');
  };


  // --- Auth Handlers (STRICT SUPABASE AUTHENTICATION) ---
  const handleSignUp = async (email: string, pass: string, name: string) => {
    const data = await supabaseAuthRequest('signup', {
      email,
      password: pass,
      data: { full_name: name, customer_type: 'member' }
    });
    if (data.access_token) {
      const newSession: AuthSession = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600),
        user: {
          id: data.user?.id || 'uid',
          email: data.user?.email || email,
          full_name: data.user?.user_metadata?.full_name || name
        }
      };
      setSession(newSession);
      safeSetItem('verde_auth_session', JSON.stringify(newSession));
      showToast(lang === 'es' ? '¡Bienvenido a Verde Roatán!' : 'Welcome to Verde Roatán!');
    }
  };

  const handleSignIn = async (email: string, pass: string) => {
    const data = await supabaseAuthRequest('token?grant_type=password', {
      email,
      password: pass
    });
    if (data.access_token) {
      const newSession: AuthSession = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600),
        user: {
          id: data.user?.id || 'uid',
          email: data.user?.email || email,
          full_name: data.user?.user_metadata?.full_name || email.split('@')[0]
        }
      };
      setSession(newSession);
      safeSetItem('verde_auth_session', JSON.stringify(newSession));
      showToast(
        checkAdminIdentity(data.user?.email || email)
          ? 'Administrator authenticated via Supabase!'
          : lang === 'es'
          ? 'Has iniciado sesión'
          : 'Signed in successfully'
      );
    }
  };

  const handleSignOut = () => {
    setSession(null);
    localStorage.removeItem('verde_auth_session');
    localStorage.removeItem('verde_is_admin');
    showToast('Signed out');
  };

  // --- Admin Catalog Image Upload Handler ---
  const handleAdminPhotoUpdate = async (productId: string, file: File) => {
    if (!session?.access_token || !isAdmin) {
      showToast('Please sign in with the authorized admin account before uploading photos.');
      return;
    }
    try {
      showToast('Compressing and uploading photo to Supabase…');
      const publicUrl = await uploadCatalogPhoto(productId, file, session.access_token);
      setCatalog((prev) => prev.map((item) =>
        item.id === productId ? { ...item, image_url: publicUrl } : item
      ));
      setCustomImages((prev) => {
        const next = { ...prev };
        delete next[productId];
        return next;
      });
      showToast('Photo uploaded and catalog record updated in Supabase.');
    } catch (error) {
      console.error('Supabase catalog photo upload failed:', error);
      showToast(error instanceof Error ? error.message : 'Photo upload failed. Your existing catalog photo was kept.');
    }
  };

  // --- DATABASE MANIPULATION HANDLERS (PLANTS, PRODUCTS, LANDSCAPERS, SUPPLIERS) ---

  // Production catalog changes are committed to Supabase before updating the screen.
  const handleSavePlant = async (plant: CatalogItem): Promise<string | null> => {
    if (!session?.access_token || !isAdmin) {
      const msg = 'Administrator sign-in is required to save catalog changes.';
      showToast(msg);
      return msg;
    }
    const merge = (saved: CatalogItem) => {
      setCatalog((prev) => {
        const i = prev.findIndex((x) => String(x.id) === String(saved.id) || x.id === plant.id);
        if (i < 0) return [saved, ...prev];
        const next = [...prev];
        next[i] = saved;
        return next;
      });
      // A legacy locally stored image would otherwise hide the photo that was just saved to the database.
      setCustomImages((prev) => {
        if (!prev[saved.id] && !prev[plant.id]) return prev;
        const next = { ...prev };
        delete next[saved.id];
        delete next[plant.id];
        return next;
      });
    };
    try {
      merge(await saveCatalogItem(plant, session.access_token));
      showToast('Plant saved to the production catalog.');
      return null;
    } catch (error) {
      console.error('Plant save failed:', error);
      // The row may have saved even though the photo step failed; keep the screen in sync with the database.
      if (error instanceof CatalogSaveError && error.saved) merge(error.saved);
      const msg = error instanceof Error ? error.message : 'Plant was not saved.';
      showToast(msg);
      return msg;
    }
  };
  const handleSaveProduct = async (product: CatalogItem): Promise<string | null> => {
    if (!session?.access_token || !isAdmin) {
      const msg = 'Administrator sign-in is required to save catalog changes.';
      showToast(msg);
      return msg;
    }
    const merge = (saved: CatalogItem) => {
      setCatalog((prev) => {
        const i = prev.findIndex((x) => String(x.id) === String(saved.id) || x.id === product.id);
        if (i < 0) return [saved, ...prev];
        const next = [...prev];
        next[i] = saved;
        return next;
      });
      // A legacy locally stored image would otherwise hide the photo that was just saved to the database.
      setCustomImages((prev) => {
        if (!prev[saved.id] && !prev[product.id]) return prev;
        const next = { ...prev };
        delete next[saved.id];
        delete next[product.id];
        return next;
      });
    };
    try {
      merge(await saveCatalogItem(product, session.access_token));
      showToast('Product saved to the production catalog.');
      return null;
    } catch (error) {
      console.error('Product save failed:', error);
      // The row may have saved even though the photo step failed; keep the screen in sync with the database.
      if (error instanceof CatalogSaveError && error.saved) merge(error.saved);
      const msg = error instanceof Error ? error.message : 'Product was not saved.';
      showToast(msg);
      return msg;
    }
  };
  const handleDeleteCatalogItem = async (id: string, name: string) => {
    if (!session?.access_token || !isAdmin) { showToast('Administrator sign-in is required to delete catalog items.'); return; }
    try { await deleteCatalogItem(id, session.access_token); setCatalog(prev => prev.filter(x => String(x.id) !== String(id))); setCart(prev => prev.filter(x => String(x.id) !== String(id))); showToast('"' + name + '" deleted from the production catalog.'); }
    catch (error) { console.error('Catalog deletion failed:', error); showToast(error instanceof Error ? error.message : 'Item was not deleted.'); }
  };
  const handleUpdateItemStock = async (id: string, delta: number) => {
    if (!session?.access_token || !isAdmin) { showToast('Administrator sign-in is required to change stock.'); return; }
    const current = catalog.find(x => String(x.id) === String(id)); if (!current) return;
    try { const qty = await updateCatalogStock(id, current.stock_quantity + delta, session.access_token); setCatalog(prev => prev.map(x => String(x.id) !== String(id) ? x : { ...x, stock_quantity: qty, stock: qty <= 0 ? 'Out of stock' : qty <= 5 ? 'Low stock' : 'In stock' })); showToast('Stock saved: ' + qty + ' units.'); }
    catch (error) { console.error('Stock update failed:', error); showToast(error instanceof Error ? error.message : 'Stock was not changed.'); }
  };
  // 5. Landscaper Add / Edit
  const handleSaveLandscaper = (crew: Landscaper) => {
    setLandscapers((prev) => {
      const idx = prev.findIndex((l) => l.id === crew.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = crew;
        return next;
      }
      return [crew, ...prev];
    });
    showToast(`Landscaper "${crew.name}" saved!`);
  };

  // 6. Delete Landscaper
  const handleDeleteLandscaper = (id: string, name: string) => {
    setLandscapers((prev) => prev.filter((l) => l.id !== id));
    showToast(`"${name}" removed from database.`);
  };

  // 7. Registered Suppliers Add / Delete
  const handleAddSupplier = (sup: RegisteredSupplier) => {
    setRegisteredSuppliers((prev) => {
      const idx = prev.findIndex((s) => s.id === sup.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = sup;
        return next;
      }
      return [sup, ...prev];
    });
    showToast(`Supplier "${sup.name}" registered!`);
  };

  const handleDeleteSupplier = (id: string) => {
    setRegisteredSuppliers((prev) => prev.filter((s) => s.id !== id));
    showToast('Supplier removed from registered locations.');
  };

  // 8. Reset Database to Verified Nursery Defaults
  const handleResetDatabase = () => {
    if (
      window.confirm(
        'Reset all plants, products, suppliers, and landscapers back to nursery defaults? Custom additions will be cleared.'
      )
    ) {
      setCatalog(INITIAL_CATALOG);
      setLandscapers(INITIAL_LANDSCAPERS);
      setRegisteredSuppliers(INITIAL_REGISTERED_SUPPLIERS);
      setCustomImages({});
      localStorage.removeItem('verde_custom_images');
      safeSetItem('verde_catalog', JSON.stringify(INITIAL_CATALOG));
      safeSetItem('verde_landscapers', JSON.stringify(INITIAL_LANDSCAPERS));
      safeSetItem('verde_suppliers', JSON.stringify(INITIAL_REGISTERED_SUPPLIERS));
      showToast('Nursery database reset to verified defaults.');
    }
  };

  return (
    <div className="app-viewport flex justify-center bg-[var(--bg)] text-[var(--ink)] pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)]">
      {/* 440px Mobile Shell */}
      <div className="app-shell w-full max-w-[440px] flex flex-col relative shadow-2xl bg-[var(--bg)]">
        {appUpdate && !updateDismissed && (
          <div role="status" className="flex items-center gap-2 bg-[var(--palm)] px-3 py-2 text-[12px] font-bold text-white">
            <span className="flex-1">
              {lang === 'es' ? `Nueva versión disponible (${appUpdate.versionName}).` : `New version available (${appUpdate.versionName}).`}
            </span>
            <a href={appUpdate.downloadUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-white px-3 py-1.5 text-[var(--palm)]">
              {lang === 'es' ? 'Actualizar' : 'Update'}
            </a>
            <button type="button" aria-label="Dismiss" onClick={() => setUpdateDismissed(true)} className="px-1 text-[16px] leading-none">×</button>
          </div>
        )}
        {/* Floating Draggable Currency Widget */}
        <CurrencyWidget
          rateData={rateData}
          isOpen={isCurrencyWidgetOpen}
          onClose={() => {
            setIsCurrencyWidgetOpen(false);
            showToast('Currency rate hidden. Tap [$ / L] in header to show.');
          }}
        />

        {/* Global App Header */}
        <Header
          lang={lang}
          onToggleLang={toggleLanguage}
          zoneName={currentZone?.name || 'Roatán'}
          onOpenZonePicker={() => setActiveModal({ type: 'zone-picker' })}
          rateHnl={rateData?.hnlPerUsd || null}
          onToggleCurrencyWidget={() => setIsCurrencyWidgetOpen((prev) => !prev)}
        />

        {/* Scrollable Screens Viewport with Ultra-Smooth Slide Motion Transitions */}
        <main className="app-main flex-1 min-h-0 overflow-y-auto overflow-x-hidden no-scrollbar px-4 pt-4 pb-4 relative">
          <AnimatePresence mode="wait" custom={slideDirection} initial={false}>
            <motion.div
              key={tab}
              custom={slideDirection}
              variants={{
                enter: (dir: number) => ({
                  x: dir > 0 ? 14 : -14,
                  opacity: 0,
                  filter: 'blur(1px)'
                }),
                center: {
                  x: 0,
                  opacity: 1,
                  filter: 'blur(0px)'
                },
                exit: (dir: number) => ({
                  x: dir > 0 ? -12 : 12,
                  opacity: 0,
                  filter: 'blur(1px)'
                }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{
                x: { duration: 0.22, ease: [0.16, 1, 0.3, 1] },
                opacity: { duration: 0.16, ease: 'easeOut' },
                filter: { duration: 0.16 }
              }}
              className="flex flex-col min-h-full will-change-transform"
            >
              {tab === 'home' && (
            <HomeScreen
              lang={lang}
              onNavigate={(nextTab) => setTab(nextTab)}
              onStartIdentify={(mode) => {
                setIdentifyMode(mode);
                setIdentifyResult(null);
                setIdentifyPhoto(null);
                setTab('id');
              }}
              catalog={currentCatalog}
              landscapers={landscapers}
              onSelectItem={(item) => {
                setSheetQty(1);
                setActiveModal({ type: 'item-details', item });
              }}
              onRequestQuote={(crew) => setActiveModal({ type: 'quote-request', crew })}
              onSearchSubmit={(q) => {
                setShopSearchInit(q);
                setTab('plants');
              }}
              formatMoney={formatMoney}
              onOpenGardenAdvisor={() => setIsGardenAdvisorOpen(true)}
            />
          )}

          {tab === 'plants' && (
            <ShopScreen
              lang={lang}
              catalog={currentCatalog}
              onSelectItem={(item) => {
                setSheetQty(1);
                setActiveModal({ type: 'item-details', item });
              }}
              rateStatus={
                rateData
                  ? `Banco Central de Honduras · ${rateData.rateDate}`
                  : 'BCH Currency Benchmark Active'
              }
              formatMoney={formatMoney}
              initialQuery={shopSearchInit}
              isAdmin={isAdmin}
              onAddPlant={() => setPlantModal({ isOpen: true, plant: null })}
              onAddProduct={() => setProductModal({ isOpen: true, product: null })}
              onEditItem={(item) => {
                if (item.t === 'plant') {
                  setPlantModal({ isOpen: true, plant: item });
                } else {
                  setProductModal({ isOpen: true, product: item });
                }
              }}
              onDeleteItem={(item) => {
                setConfirmDelete({
                  isOpen: true,
                  title: `Delete ${item.t === 'plant' ? 'Plant' : 'Product'}`,
                  itemName: item.name,
                  itemType: item.t,
                  onConfirm: () => handleDeleteCatalogItem(item.id, item.name)
                });
              }}
              onRequestSpecialSourcing={(plantName) =>
                setSpecialSourcingModal({ isOpen: true, plantName })
              }
              onNavigateToIdentify={() => setTab('id')}
              onOpenGardenAdvisor={() => setIsGardenAdvisorOpen(true)}
            />
          )}

          {tab === 'id' && (
            <IdentifyScreen
              lang={lang}
              mode={identifyMode}
              onModeChange={(m) => setIdentifyMode(m)}
              onAnalyze={handleAnalyzeSpecimen}
              isLoading={identifyLoading}
              isRefining={isRefiningSpecimen}
              result={identifyResult}
              error={identifyError}
              currentPhoto={identifyPhoto}
              onDeepRefresh={handleDeepRefreshSpecimen}
              onReset={() => {
                setIdentifyPhoto(null);
                setIdentifyResult(null);
                setIdentifyError(null);
              }}
              onSaveToGarden={handleSaveToGarden}
              onSubmitFeedback={handleSubmitIdentificationFeedback}
              onAddToCart={(storeId, qty) => handleAddToCart(storeId, qty)}
              formatMoney={formatMoney}
              catalog={currentCatalog}
              onRequestSpecialSourcing={(plantName, sciName) =>
                setSpecialSourcingModal({ isOpen: true, plantName, scientificName: sciName })
              }
              onOpenBotanicalAssistant={() => {
                setTab('account');
                showToast(
                  lang === 'es'
                    ? 'Abriendo Centro de Conocimiento Botánico...'
                    : 'Opening Botanical Knowledge Center...'
                );
              }}
            />
          )}

          {tab === 'svc' && (
            <ServicesScreen
              lang={lang}
              landscapers={landscapers}
              onRequestQuote={(crew) => setActiveModal({ type: 'quote-request', crew })}
              isAdmin={isAdmin}
              onAddLandscaper={() => setLandscaperModal({ isOpen: true, landscaper: null })}
              onEditLandscaper={(crew) => setLandscaperModal({ isOpen: true, landscaper: crew })}
              onDeleteLandscaper={(crew) => {
                setConfirmDelete({
                  isOpen: true,
                  title: 'Delete Landscaper Crew',
                  itemName: crew.name,
                  itemType: 'landscaper',
                  onConfirm: () => handleDeleteLandscaper(crew.id, crew.name)
                });
              }}
            />
          )}

          {tab === 'request' && (
            <DeliveryScreen
              lang={lang}
              cart={cart}
              catalog={currentCatalog}
              zones={zones}
              selectedZoneId={selectedZoneId}
              onOpenZonePicker={() => setActiveModal({ type: 'zone-picker' })}
              onUpdateQty={handleUpdateQty}
              onRemoveItem={handleRemoveFromCart}
              onNavigate={(nextTab) => setTab(nextTab)}
              onSubmitCheckout={handleSubmitCheckout}
              isSubmitting={isSubmittingOrder}
              orderResult={orderResult}
              onResetOrder={() => setOrderResult(null)}
              currency={currency}
              onCurrencyChange={setCurrency}
              formatMoney={formatMoney}
              exchangeRateHnl={rateData?.hnlPerUsd || 26}
              activeOrders={activeOrders}
              orderHistory={orderHistory}
              onConfirmDelivery={handleConfirmDelivery}
              onAdvanceOrderStatus={handleAdvanceOrderStatus}
              isAdmin={isAdmin}
              onOpenTransportFeeModal={handleOpenTransportFeeModal}
              onSendCustomerMessage={handleSendCustomerMessage}
            />
          )}

          {tab === 'account' && (
            <AccountScreen
              lang={lang}
              session={session}
              isAdmin={isAdmin}
              onSignIn={handleSignIn}
              onSignUp={handleSignUp}
              onSignOut={handleSignOut}
              garden={garden}
              onRemoveFromGarden={handleRemoveGardenItem}
              onGuestContinue={() => setTab('plants')}
              catalog={currentCatalog}
              landscapers={landscapers}
              registeredSuppliers={registeredSuppliers}
              onAddPlant={() => setPlantModal({ isOpen: true, plant: null })}
              onAddProduct={() => setProductModal({ isOpen: true, product: null })}
              onEditItem={(item) => {
                if (item.t === 'plant') {
                  setPlantModal({ isOpen: true, plant: item });
                } else {
                  setProductModal({ isOpen: true, product: item });
                }
              }}
              onDeleteItem={(item) => {
                setConfirmDelete({
                  isOpen: true,
                  title: `Delete ${item.t === 'plant' ? 'Plant' : 'Product'}`,
                  itemName: item.name,
                  itemType: item.t,
                  onConfirm: () => handleDeleteCatalogItem(item.id, item.name)
                });
              }}
              onUpdateItemStock={handleUpdateItemStock}
              onAddLandscaper={() => setLandscaperModal({ isOpen: true, landscaper: null })}
              onEditLandscaper={(crew) => setLandscaperModal({ isOpen: true, landscaper: crew })}
              onDeleteLandscaper={(crew) => {
                setConfirmDelete({
                  isOpen: true,
                  title: 'Delete Landscaper Crew',
                  itemName: crew.name,
                  itemType: 'landscaper',
                  onConfirm: () => handleDeleteLandscaper(crew.id, crew.name)
                });
              }}
              onAddSupplier={handleAddSupplier}
              onDeleteSupplier={handleDeleteSupplier}
              onResetDatabase={handleResetDatabase}
              formatMoney={formatMoney}
              zones={zones}
              onUpdateZoneFee={handleUpdateZoneFee}
              onOpenTransportModal={() => handleOpenTransportFeeModal()}
              orders={[...activeOrders, ...orderHistory]}
              onUpdateOrder={handleUpdateOrder}
              onAdvanceOrderStatus={handleAdvanceOrderStatus}
              transactions={transactions}
              onAddTransaction={handleAddTransaction}
              supplierRequests={supplierRequests}
              onUpdateSupplierRequest={handleUpdateSupplierRequest}
              notifications={notifications}
              onMarkNotificationRead={handleMarkNotificationRead}
              onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
              exchangeRateHnl={rateData?.hnlPerUsd || 26}
              onSendOrderMessage={handleSendOrderMessage}
            />
          )}
          </motion.div>
          </AnimatePresence>
        </main>

        {/* Persistent Bottom Tab Navigation */}
        <div className="app-bottom-nav shrink-0 px-3 pt-1 bg-gradient-to-t from-[var(--bg)] via-[var(--bg)] to-transparent">
          <Navigation
            activeTab={tab}
            onSelectTab={(nextTab) => setTab(nextTab)}
            cartCount={cartCount}
            activeOrdersCount={activeOrders.length}
            lang={lang}
          />
        </div>

        {/* Global Toast Notification */}
        {toastMessage && (
          <div
            role="status"
            className="fixed left-1/2 -translate-x-1/2 bottom-[calc(6rem_+_env(safe-area-inset-bottom,0px))] z-60 bg-[var(--ink)] text-[var(--bg)] px-4 py-2.5 rounded-2xl font-semibold text-[13.5px] shadow-2xl max-w-[90vw] text-center pointer-events-none animate-in fade-in zoom-in-95 duration-150"
          >
            {toastMessage}
          </div>
        )}

        {/* --- MODAL BOTTOM SHEETS --- */}

        {/* 1. Item Details Sheet */}
        <BottomSheet
          isOpen={activeModal?.type === 'item-details'}
          onClose={() => setActiveModal(null)}
        >
          {activeModal?.type === 'item-details' && detailItem && (
            <div className="flex flex-col gap-4">
              {/* Product Hero Image */}
              <div className="w-full aspect-2/1 rounded-2xl overflow-hidden bg-[var(--surface-2)] flex items-center justify-center">
                {detailItem.image_url ? (
                  <img
                    src={detailItem.image_url}
                    alt={detailItem.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Palmtree className="w-16 h-16 text-[var(--palm)]" />
                )}
              </div>

              {/* Title & Scientific Name */}
              <div className="flex flex-col gap-0.5">
                <h2 className="text-[22px] font-extrabold text-[var(--ink)] leading-tight pr-8">
                  {detailItem.name}
                </h2>
                <small className="text-[12.5px] text-[var(--ink-soft)] italic">
                  {detailItem.sci}
                </small>
              </div>

              {/* Price & Stock */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[20px] font-extrabold text-[var(--ink)]">
                    {formatMoney(detailItem.price, detailItem.currency)}
                  </div>
                  <small className="text-[12px] text-[var(--ink-soft)]">
                    {detailItem.size}
                  </small>
                </div>

                <span className="text-[12px] font-bold px-2.5 py-1 rounded-full bg-[var(--palm)]/15 text-[var(--palm)]">
                  {detailItem.stock} ({detailItem.stock_quantity} available)
                </span>
              </div>

              {/* Botanical Specs Grid */}
              {detailItem.t === 'plant' && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-[var(--surface-2)] rounded-xl p-2.5 flex flex-col gap-1">
                    <span className="text-[10.5px] font-extrabold uppercase text-[var(--ink-soft)] tracking-wider">
                      {t('saltSpray')}
                    </span>
                    <span className="inline-flex gap-1 items-center">
                      {[1, 2, 3].map((dot) => (
                        <i
                          key={dot}
                          className={`w-2 h-2 rounded-full not-italic ${
                            dot <= detailItem.salt
                              ? 'bg-[var(--lagoon)]'
                              : 'bg-[var(--line)]'
                          }`}
                        />
                      ))}
                    </span>
                  </div>

                  <div className="bg-[var(--surface-2)] rounded-xl p-2.5 flex flex-col gap-0.5">
                    <span className="text-[10.5px] font-extrabold uppercase text-[var(--ink-soft)] tracking-wider">
                      {t('sun')}
                    </span>
                    <b className="text-[12.5px] text-[var(--ink)] truncate">
                      {detailItem.sun}
                    </b>
                  </div>

                  <div className="bg-[var(--surface-2)] rounded-xl p-2.5 flex flex-col gap-0.5">
                    <span className="text-[10.5px] font-extrabold uppercase text-[var(--ink-soft)] tracking-wider">
                      {t('water')}
                    </span>
                    <b className="text-[12.5px] text-[var(--ink)] truncate">
                      {detailItem.water}
                    </b>
                  </div>

                  <div className="bg-[var(--surface-2)] rounded-xl p-2.5 flex flex-col gap-0.5">
                    <span className="text-[10.5px] font-extrabold uppercase text-[var(--ink-soft)] tracking-wider">
                      {t('pets')}
                    </span>
                    <b className="text-[12.5px] text-[var(--ink)]">
                      {detailItem.pet === 'safe' ? 'Pet Safe' : 'Check Toxicities'}
                    </b>
                  </div>
                </div>
              )}

              {/* Note / Description */}
              <p className="text-[13px] text-[var(--ink)] leading-relaxed">
                {detailItem.note}
              </p>

              <small className="text-[11.5px] text-[var(--ink-soft)]">
                Registered Supplier: <b className="text-[var(--ink)]">{detailItem.nursery}</b>. Island-wide delivery available.
              </small>

              {/* Quantity Stepper & Add to Cart Button */}
              <div className="flex items-center gap-3 pt-2">
                <div className="flex items-center gap-2 bg-[var(--surface-2)] p-1 rounded-2xl">
                  <button
                    type="button"
                    onClick={() => setSheetQty((q) => Math.max(1, q - 1))}
                    className="w-8 h-8 rounded-xl bg-[var(--surface)] text-[var(--ink)] flex items-center justify-center font-bold text-base shadow-xs active:scale-90 transition-all"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-6 text-center font-extrabold text-[15px] tabular-nums">
                    {sheetQty}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSheetQty((q) => Math.min(25, q + 1))}
                    className="w-8 h-8 rounded-xl bg-[var(--surface)] text-[var(--ink)] flex items-center justify-center font-bold text-base shadow-xs active:scale-90 transition-all"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    handleAddToCart(detailItem.id, sheetQty);
                    setActiveModal(null);
                  }}
                  className="flex-1 min-h-[48px] bg-[var(--palm)] hover:bg-[var(--palm)]/90 text-white font-extrabold text-[14.5px] rounded-2xl shadow-xs active:scale-98 transition-all flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  {t('addToCart')}
                </button>
              </div>

              {/* Admin Actions in Item Details */}
              {isAdmin && (
                <div className="flex flex-col gap-2.5 pt-3 border-t border-[var(--line)]">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--palm)]">
                    Admin Specimen Controls
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const target = detailItem;
                        setActiveModal(null);
                        if (target.t === 'plant') {
                          setPlantModal({ isOpen: true, plant: target });
                        } else {
                          setProductModal({ isOpen: true, product: target });
                        }
                      }}
                      className="flex-1 py-2.5 px-3 rounded-xl bg-[var(--surface-2)] hover:bg-[var(--palm)] hover:text-white text-[var(--ink)] font-bold text-[13px] flex items-center justify-center gap-1.5 transition-all border border-[var(--line)]"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      Edit Parameters
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const target = detailItem;
                        setActiveModal(null);
                        setConfirmDelete({
                          isOpen: true,
                          title: `Delete ${target.t === 'plant' ? 'Plant' : 'Product'}`,
                          itemName: target.name,
                          itemType: target.t,
                          onConfirm: () => handleDeleteCatalogItem(target.id, target.name)
                        });
                      }}
                      className="py-2.5 px-3 rounded-xl bg-red-50 hover:bg-red-600 hover:text-white text-red-600 font-bold text-[13px] flex items-center justify-center gap-1.5 transition-all border border-red-200"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  </div>

                  {/* Photo Update direct */}
                  <label
                    htmlFor="admin-photo-input"
                    className="flex items-center justify-center gap-2 w-full py-2 bg-[var(--surface)] hover:bg-white text-[var(--ink)] font-bold text-[12.5px] rounded-xl border border-[var(--line)] cursor-pointer active:scale-95 transition-all"
                  >
                    <Camera className="w-4 h-4 text-[var(--palm)]" />
                    {t('adminPhotoUpdate')}
                  </label>
                  <input
                    id="admin-photo-input"
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleAdminPhotoUpdate(detailItem.id, file);
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </BottomSheet>

        {/* 2. Zone Picker Sheet */}
        <BottomSheet
          isOpen={activeModal?.type === 'zone-picker'}
          onClose={() => setActiveModal(null)}
        >
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-0.5 pr-8">
              <div className="flex items-center justify-between">
                <h2 className="text-[20px] font-extrabold text-[var(--ink)]">
                  {t('pickDeliveryArea')}
                </h2>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveModal(null);
                      handleOpenTransportFeeModal();
                    }}
                    className="text-[11.5px] font-extrabold px-3 py-1 rounded-full bg-[var(--palm)]/15 text-[var(--palm)] hover:bg-[var(--palm)] hover:text-white transition-all flex items-center gap-1 border border-[var(--palm)]/30"
                  >
                    <Edit2 className="w-3 h-3" />
                    <span>{lang === 'es' ? 'Editar Tarifas' : 'Edit Transport Fees'}</span>
                  </button>
                )}
              </div>
              <small className="text-[12px] text-[var(--ink-soft)]">
                Select your Roatán neighborhood for calculated delivery fees
              </small>
            </div>

            <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto no-scrollbar">
              {zones.map((zone) => {
                const isSelected = zone.id === selectedZoneId;
                return (
                  <div
                    key={zone.id}
                    onClick={() => {
                      setSelectedZoneId(zone.id);
                      setActiveModal(null);
                      showToast(`Delivery zone set: ${zone.name}`);
                    }}
                    className={`flex items-center justify-between p-3 rounded-2xl border text-left transition-all cursor-pointer active:scale-98 ${
                      isSelected
                        ? 'bg-[var(--surface-2)] border-[var(--palm)] shadow-xs'
                        : 'bg-[var(--surface)] border-[var(--line)] hover:border-[var(--palm)]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-10 h-10 rounded-xl bg-[var(--lagoon)]/15 text-[var(--lagoon)] flex items-center justify-center shrink-0">
                        <MapPin className="w-5 h-5" />
                      </span>
                      <div className="flex flex-col">
                        <b className="text-[14.5px] text-[var(--ink)] font-bold">{zone.name}</b>
                        <small className="text-[11.5px] text-[var(--ink-soft)]">
                          {zone.description || 'Island Neighborhood'}
                        </small>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <b className="text-[13.5px] font-extrabold text-[var(--palm)] tabular-nums">
                        {formatMoney(zone.fee, zone.currency)}
                      </b>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveModal(null);
                            handleOpenTransportFeeModal(zone.id);
                          }}
                          className="p-1.5 rounded-lg bg-[var(--surface)] hover:bg-[var(--palm)] hover:text-white text-[var(--palm)] transition-all border border-[var(--line)]"
                          title="Edit transport fee"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </BottomSheet>

        {/* 3. Landscaper Quote Sheet */}
        <BottomSheet
          isOpen={activeModal?.type === 'quote-request'}
          onClose={() => setActiveModal(null)}
        >
          {activeModal?.type === 'quote-request' && (
            <LandscaperQuoteForm
              crew={activeModal.crew}
              zones={zones}
              defaultZoneName={currentZone?.name}
              session={session}
              lang={lang}
              title={t('quoteTitle')}
              submitLabel={t('sendRequest')}
              onRequireSignIn={() => {
                setActiveModal(null);
                setTab('account');
              }}
              onSubmitted={(num) => {
                setActiveModal(null);
                showToast(
                  `Request ${num || ''} saved. ${activeModal.crew.name} will be contacted by Verde Roatán.`.replace('  ', ' ')
                );
              }}
            />
          )}
        </BottomSheet>

        {/* --- FULL PARAMETER EDIT & ADD MODALS (WITH REGISTERED SUPPLIER POP BOX) --- */}

        {/* Plant Modal (Add or Edit) */}
        <PlantEditModal
          lang={lang}
          isOpen={plantModal.isOpen}
          initialPlant={plantModal.plant}
          registeredSuppliers={registeredSuppliers}
          onQuickAddSupplier={handleAddSupplier}
          onClose={() => setPlantModal({ isOpen: false, plant: null })}
          onSave={handleSavePlant}
        />

        {/* Product Modal (Add or Edit) */}
        <ProductEditModal
          lang={lang}
          isOpen={productModal.isOpen}
          initialProduct={productModal.product}
          registeredSuppliers={registeredSuppliers}
          onQuickAddSupplier={handleAddSupplier}
          onClose={() => setProductModal({ isOpen: false, product: null })}
          onSave={handleSaveProduct}
        />

        {/* Landscaper Modal (Add or Edit) */}
        <LandscaperEditModal
          lang={lang}
          isOpen={landscaperModal.isOpen}
          initialLandscaper={landscaperModal.landscaper}
          onClose={() => setLandscaperModal({ isOpen: false, landscaper: null })}
          onSave={handleSaveLandscaper}
        />

        {/* Confirm Delete Modal */}
        <ConfirmDeleteModal
          isOpen={confirmDelete.isOpen}
          title={confirmDelete.title}
          itemName={confirmDelete.itemName}
          itemType={confirmDelete.itemType}
          onClose={() => setConfirmDelete((prev) => ({ ...prev, isOpen: false }))}
          onConfirm={confirmDelete.onConfirm}
        />

        {/* Special Grower Sourcing Modal (For species not currently in catalog) */}
        <SpecialSourcingModal
          isOpen={specialSourcingModal.isOpen}
          onClose={() => setSpecialSourcingModal({ isOpen: false, plantName: '' })}
          plantName={specialSourcingModal.plantName}
          scientificName={specialSourcingModal.scientificName}
          lang={lang}
          zones={zones}
          selectedZoneId={selectedZoneId}
          showToast={showToast}
        />

        {/* Admin Transport Fee Management Modal */}
        <TransportFeeModal
          isOpen={isTransportFeeModalOpen}
          onClose={() => setIsTransportFeeModalOpen(false)}
          zones={zones}
          selectedZoneId={editingZoneId}
          onUpdateZoneFee={handleUpdateZoneFee}
          lang={lang}
          exchangeRateHnl={rateData?.hnlPerUsd || 26}
        />

        {/* AI Garden Advisor Modal */}
        <GardenAdvisorModal
          isOpen={isGardenAdvisorOpen}
          onClose={() => setIsGardenAdvisorOpen(false)}
          catalog={currentCatalog}
          onAddToCart={(item) => handleAddToCart(item.id, 1)}
          lang={lang}
          currency={currency}
          exchangeRateHnl={rateData?.hnlPerUsd || 26}
        />
      </div>
    </div>
  );
}
