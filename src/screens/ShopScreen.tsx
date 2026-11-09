import { localizedName } from '../lib/catalogLocale';
import { matchesQuery } from '../lib/botanicalRules';
import React, { useMemo, useState } from 'react';
import { Edit2, Filter, Flower2, Palmtree, Plus, Search, ShoppingBag, Shovel, Sparkles, Sprout, Trash2, X } from 'lucide-react';
import { CatalogItem, ItemType, Language } from '../types';
import { STRINGS } from '../data/initialData';

interface ShopScreenProps {
  lang: Language;
  catalog: CatalogItem[];
  /** Result of the last live catalog refresh. */
  catalogStatus?: 'loading' | 'ok' | 'failed';
  onRetryCatalog?: () => void;
  onSelectItem: (item: CatalogItem) => void;
  rateStatus: string;
  formatMoney: (val: number, cur: string) => React.ReactNode;
  initialQuery?: string;
  isAdmin?: boolean;
  onAddPlant?: () => void;
  onAddProduct?: () => void;
  onEditItem?: (item: CatalogItem) => void;
  onDeleteItem?: (item: CatalogItem) => void;
  onRequestSpecialSourcing?: (plantName: string) => void;
  onNavigateToIdentify?: () => void;
  onOpenGardenAdvisor?: () => void;
  cartCount?: number;
  onOpenCart?: () => void;
}

export const ShopScreen: React.FC<ShopScreenProps> = ({
  lang,
  catalog,
  catalogStatus = 'ok',
  onRetryCatalog,
  onSelectItem,
  rateStatus,
  formatMoney,
  initialQuery = '',
  isAdmin = false,
  onAddPlant,
  onAddProduct,
  onEditItem,
  onDeleteItem,
  onRequestSpecialSourcing,
  onNavigateToIdentify,
  onOpenGardenAdvisor,
  cartCount = 0,
  onOpenCart
}) => {
  const [kind, setKind] = useState<ItemType>('plant');
  const [query, setQuery] = useState(initialQuery);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const t = (k: string) => STRINGS[lang]?.[k] || STRINGS.en[k] || k;

  const plantFilters = [
    { id: 'all', label: t('all') },
    { id: 'palm', label: t('palms') },
    { id: 'shrub', label: t('shrubs') },
    { id: 'flower', label: t('flowers') },
    { id: 'grass', label: t('grasses') }
  ];

  const productFilters = [
    { id: 'all', label: t('all') },
    { id: 'bag', label: 'Soil & Compost' },
    { id: 'bottle', label: 'Pest Control' }
  ];

  const currentFilters = kind === 'plant' ? plantFilters : productFilters;

  const filteredItems = useMemo(() => {
    return catalog.filter((item) => {
      if (item.t !== kind) return false;
      if (categoryFilter !== 'all') {
        if (item.kind !== categoryFilter && !item.tags.includes(categoryFilter)) {
          return false;
        }
      }
      if (query.trim() && !matchesQuery(item, query)) return false;
      return true;
    });
  }, [catalog, kind, categoryFilter, query]);

  const getStockBadge = (stock: string) => {
    if (stock === 'In stock') {
      return (
        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[var(--palm)]/15 text-[var(--palm)]">
          {t('inStock')}
        </span>
      );
    }
    if (stock === 'Low stock') {
      return (
        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[var(--sun)]/25 text-[var(--note-ink)]">
          {t('lowStock')}
        </span>
      );
    }
    return (
      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[var(--surface-2)] text-[var(--ink-soft)]">
        {t('outOfStock')}
      </span>
    );
  };

  return (
    <div className="flex flex-col gap-3.5 pb-6">
      {/* Header */}
      <header className="flex items-center justify-between px-1">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-[24px] font-extrabold text-[var(--ink)] tracking-tight">
            {t('shop')}
          </h1>
          <p className="text-[11px] text-[var(--ink-soft)] font-medium">
            {rateStatus}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenCart}
            aria-label={lang === 'es' ? 'Abrir carrito y entregas' : 'Open cart and deliveries'}
            className="relative inline-flex min-h-10 items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[12px] font-bold text-[var(--ink)] shadow-xs active:scale-95"
          >
            <ShoppingBag className="h-4 w-4 text-[var(--palm)]" />
            <span>{lang === 'es' ? 'Carrito' : 'Cart'}</span>
            {cartCount > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--palm)] px-1 text-[10px] font-extrabold text-white">{cartCount}</span>}
          </button>
        </div>

        {/* Admin Action Buttons */}
        {isAdmin && (
          <div className="flex items-center gap-1.5">
            {kind === 'plant' ? (
              <button
                type="button"
                onClick={onAddPlant}
                className="inline-flex items-center gap-1 text-[12px] font-extrabold px-3 py-1.5 rounded-xl bg-[var(--palm)] text-white hover:opacity-90 active:scale-95 shadow-xs transition-all"
              >
                <Plus className="w-3.5 h-3.5" /> + Plant
              </button>
            ) : (
              <button
                type="button"
                onClick={onAddProduct}
                className="inline-flex items-center gap-1 text-[12px] font-extrabold px-3 py-1.5 rounded-xl bg-[var(--lagoon)] text-white hover:opacity-90 active:scale-95 shadow-xs transition-all"
              >
                <Plus className="w-3.5 h-3.5" /> + Product
              </button>
            )}
          </div>
        )}
      </header>

      {/* Plants vs Products Segmented Control */}
      <div className="grid grid-cols-2 bg-[var(--surface-2)] p-1 rounded-2xl gap-1" role="group">
        <button
          type="button"
          onClick={() => {
            setKind('plant');
            setCategoryFilter('all');
          }}
          aria-pressed={kind === 'plant'}
          className={`py-2 rounded-xl text-[14px] font-bold transition-all ${
            kind === 'plant'
              ? 'bg-[var(--surface)] text-[var(--ink)] shadow-xs'
              : 'text-[var(--ink-soft)] hover:text-[var(--ink)]'
          }`}
        >
          {t('plants')} ({catalog.filter((c) => c.t === 'plant').length})
        </button>
        <button
          type="button"
          onClick={() => {
            setKind('product');
            setCategoryFilter('all');
          }}
          aria-pressed={kind === 'product'}
          className={`py-2 rounded-xl text-[14px] font-bold transition-all ${
            kind === 'product'
              ? 'bg-[var(--surface)] text-[var(--ink)] shadow-xs'
              : 'text-[var(--ink-soft)] hover:text-[var(--ink)]'
          }`}
        >
          {t('products')} ({catalog.filter((c) => c.t === 'product').length})
        </button>
      </div>

      {/* AI Garden Consultant Banner */}
      {onOpenGardenAdvisor && (
        <div
          role="button"
          tabIndex={0}
          onClick={onOpenGardenAdvisor}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onOpenGardenAdvisor();
            }
          }}
          className="bg-gradient-to-r from-[var(--palm)]/15 via-[var(--surface-2)] to-emerald-500/10 border border-[var(--palm)]/30 rounded-2xl p-3 sm:p-3.5 flex items-center justify-between gap-3 cursor-pointer hover:border-[var(--palm)] transition-all shadow-xs group"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--palm)] to-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs group-hover:scale-105 transition-transform">
              <Sparkles className="w-5 h-5 text-amber-300" />
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <b className="text-[13.5px] font-extrabold text-[var(--ink)]">
                  {lang === 'es' ? 'Asesor Botánico con IA' : 'AI Garden Consultant'}
                </b>
                <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-[var(--palm)]/20 text-[var(--palm)] uppercase tracking-wider">
                  Rootwise AI
                </span>
              </div>
              <p className="text-[11.5px] text-[var(--ink-soft)] truncate">
                {lang === 'es'
                  ? 'Describa su suelo, sol y objetivos para recomendaciones de plantas del vivero'
                  : 'Describe your soil, sun & goals for personalized nursery catalog matches'}
              </p>
            </div>
          </div>
          <span className="text-[12px] font-extrabold text-[var(--palm)] shrink-0 group-hover:translate-x-1 transition-transform flex items-center gap-1">
            <span>{lang === 'es' ? 'Consultar' : 'Consult'}</span>
            <span>→</span>
          </span>
        </div>
      )}

      {/* Search Input */}
      <div className="relative flex items-center">
        <Search className="absolute left-3.5 w-5 h-5 text-[var(--ink-soft)] pointer-events-none" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={kind === 'plant' ? t('searchPlants') : t('searchProducts')}
          className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-2xl pl-11 pr-10 py-2.5 text-[15px] focus:outline-none focus:border-[var(--lagoon)] focus:ring-2 focus:ring-[var(--lagoon)]/25 shadow-xs transition-all"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="absolute right-3 p-1 rounded-full text-[var(--ink-soft)] hover:text-[var(--ink)]"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Filter Chips Carousel */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-0.5">
        {currentFilters.map((flt) => {
          const isSelected = categoryFilter === flt.id;
          return (
            <button
              key={flt.id}
              type="button"
              onClick={() => setCategoryFilter(flt.id)}
              aria-pressed={isSelected}
              className={`flex-none px-3.5 py-1.5 rounded-full text-[13.5px] font-semibold border transition-all active:scale-95 ${
                isSelected
                  ? 'bg-[var(--palm)] border-[var(--palm)] text-[var(--on-palm)] shadow-xs'
                  : 'bg-[var(--surface)] border-[var(--line)] text-[var(--ink)] hover:border-[var(--palm)]'
              }`}
            >
              {flt.label}
            </button>
          );
        })}
      </div>

      {catalogStatus === 'failed' && (
        <div role="status" className="flex items-center justify-between gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] text-[var(--ink)]">
          <span>{lang === 'es' ? 'No se pudo actualizar el catálogo. Mostrando la última versión guardada.' : "Couldn't refresh the catalog. Showing your last saved version."}</span>
          {onRetryCatalog && (
            <button type="button" onClick={onRetryCatalog} className="shrink-0 rounded-lg bg-[var(--palm)] px-3 py-1.5 text-[11.5px] font-extrabold text-white">
              {lang === 'es' ? 'Reintentar' : 'Retry'}
            </button>
          )}
        </div>
      )}

      {/* Items List */}
      <div className="flex flex-col gap-2.5">
        {filteredItems.length === 0 ? (
          <div className="bg-[var(--surface)] border-2 border-amber-500/40 rounded-2xl p-6 text-center text-[var(--ink)] flex flex-col items-center gap-2.5 shadow-xs">
            <div className="w-12 h-12 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 flex items-center justify-center">
              <Sprout className="w-6 h-6" />
            </div>

            <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-700 dark:text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/30">
              {t('notInCatalog')}
            </span>

            <div className="flex flex-col gap-1 max-w-[320px]">
              <h3 className="text-[16px] font-extrabold text-[var(--ink)]">
                {query.trim()
                  ? lang === 'es'
                    ? `«${query}» no está en el catálogo`
                    : `"${query}" is not in the catalog`
                  : lang === 'es'
                  ? 'No hay artículos disponibles'
                  : 'No items match your filter'}
              </h3>
              <p className="text-[12.5px] text-[var(--ink-soft)] leading-relaxed">
                {query.trim()
                  ? lang === 'es'
                    ? 'Esta planta no se encuentra actualmente en las camas de nuestro vivero en Roatán. Puedes solicitar una búsqueda especial a viveristas asociados.'
                    : 'This plant is not currently in the Verde Roatán nursery inventory. You can request special sourcing from our partner growers.'
                  : lang === 'es'
                  ? 'Intenta restablecer tus filtros para ver todo el inventario.'
                  : 'Try resetting your category filters to view all available plants.'}
              </p>
            </div>

            <div className="flex flex-col gap-2 w-full max-w-[280px] mt-1">
              {query.trim() && onRequestSpecialSourcing && (
                <button
                  type="button"
                  onClick={() => onRequestSpecialSourcing(query.trim())}
                  className="w-full py-2.5 px-4 rounded-xl bg-[var(--palm)] hover:bg-[var(--palm)]/90 text-white font-bold text-[13px] flex items-center justify-center gap-2 shadow-xs active:scale-98 transition-all"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {t('requestSpecialSourcing')}
                </button>
              )}

              {query.trim() && onNavigateToIdentify && (
                <button
                  type="button"
                  onClick={onNavigateToIdentify}
                  className="w-full py-2 px-3 rounded-xl bg-[var(--surface-2)] text-[var(--ink)] font-bold text-[12.5px] flex items-center justify-center gap-1.5 hover:bg-[var(--line)] active:scale-98 transition-all"
                >
                  <Search className="w-3.5 h-3.5 text-[var(--palm)]" />
                  {lang === 'es' ? 'Identificar con Cámara' : 'Identify with Camera'}
                </button>
              )}

              {isAdmin && (
                <button
                  type="button"
                  onClick={kind === 'plant' ? onAddPlant : onAddProduct}
                  className="w-full py-2 px-3 rounded-xl bg-[var(--surface-2)] text-[var(--palm)] border border-[var(--palm)] font-bold text-[12.5px] shadow-xs"
                >
                  + Add {kind === 'plant' ? 'Plant Specimen' : 'Product'} to Database
                </button>
              )}

              {(query || categoryFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    setCategoryFilter('all');
                  }}
                  className="text-[12px] font-bold text-[var(--ink-soft)] hover:underline mt-1"
                >
                  {lang === 'es' ? 'Restablecer búsqueda' : 'Reset search & filters'}
                </button>
              )}
            </div>
          </div>
        ) : (
          filteredItems.map((item) => (
            <div
              key={item.id}
              className="group flex items-center gap-3 bg-[var(--surface)] hover:bg-[var(--surface-2)] border border-[var(--line)] rounded-2xl p-2.5 text-left transition-all shadow-xs relative"
            >
              {/* Clickable Card Body */}
              <button
                type="button"
                onClick={() => onSelectItem(item)}
                className="flex-1 flex items-center gap-3 min-w-0 text-left active:scale-99 transition-transform"
              >
                {/* Thumbnail */}
                <div className="w-14 h-14 rounded-xl overflow-hidden bg-[var(--surface-2)] shrink-0 flex items-center justify-center">
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={localizedName(item, lang)}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  ) : (
                    <span className="text-[var(--palm)]">
                      {item.kind === 'palm' && <Palmtree className="w-7 h-7" />}
                      {item.kind === 'flower' && <Flower2 className="w-7 h-7" />}
                      {item.kind === 'shrub' && <Sprout className="w-7 h-7" />}
                      {item.t === 'product' && <Shovel className="w-7 h-7 text-[var(--lagoon)]" />}
                    </span>
                  )}
                </div>

                {/* Title & Specs */}
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <b className="text-[14.5px] leading-snug font-bold text-[var(--ink)] truncate">
                    {localizedName(item, lang)}
                  </b>
                  <small className="text-[11.5px] text-[var(--ink-soft)] italic truncate">
                    {item.scientific_name || item.sci}
                  </small>
                  <div className="text-[13px] font-extrabold text-[var(--ink)] mt-0.5">
                    {formatMoney(item.price, item.currency)}{' '}
                    <span className="font-normal text-[11.5px] text-[var(--ink-soft)]">
                      · {item.size}
                    </span>
                  </div>
                </div>
              </button>

              {/* Status Badge & Admin Controls */}
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="shrink-0">{getStockBadge(item.stock)}</div>

                {isAdmin && (
                  <div className="flex items-center gap-1 pl-1 border-l border-[var(--line)]">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditItem?.(item);
                      }}
                      title="Edit item parameters"
                      className="p-1.5 rounded-lg bg-[var(--surface-2)] hover:bg-[var(--palm)] hover:text-white text-[var(--ink)] transition-all"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteItem?.(item);
                      }}
                      title="Delete from database"
                      className="p-1.5 rounded-lg bg-red-50 hover:bg-red-600 hover:text-white text-red-600 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
