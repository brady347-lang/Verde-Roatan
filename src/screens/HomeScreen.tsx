import React, { useState } from 'react';
import {
  Bug,
  ChevronRight,
  Compass,
  Droplets,
  Flower2,
  Palmtree,
  Search,
  Sparkles,
  Sprout,
  Star,
  Wrench
} from 'lucide-react';
import { CatalogItem, Landscaper, Language } from '../types';
import { STRINGS } from '../data/initialData';

interface HomeScreenProps {
  lang: Language;
  isSignedIn: boolean;
  isAdmin: boolean;
  displayName: string;
  gardenCount: number;
  cartCount: number;
  activeOrdersCount: number;
  onNavigate: (tab: any) => void;
  onStartIdentify: (mode: 'plant' | 'pest') => void;
  catalog: CatalogItem[];
  landscapers: Landscaper[];
  onSelectItem: (item: CatalogItem) => void;
  onRequestQuote: (landscaper: Landscaper) => void;
  onSearchSubmit: (query: string) => void;
  formatMoney: (val: number, cur: string) => React.ReactNode;
  onOpenGardenAdvisor?: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  lang,
  isSignedIn,
  isAdmin,
  displayName,
  gardenCount,
  cartCount,
  activeOrdersCount,
  onNavigate,
  onStartIdentify,
  catalog,
  landscapers,
  onSelectItem,
  onRequestQuote,
  onSearchSubmit,
  formatMoney,
  onOpenGardenAdvisor
}) => {
  const [searchVal, setSearchVal] = useState('');
  const t = (k: string) => STRINGS[lang]?.[k] || STRINGS.en[k] || k;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchVal.trim()) {
      onSearchSubmit(searchVal.trim());
    }
  };

  const featured = catalog.filter((c) => c.t === 'plant').slice(0, 5);

  return (
    <div className="flex flex-col gap-4.5 pb-6">
      {/* Hero Header */}
      <header className="flex flex-col gap-1 px-1">
        <span className="text-[12px] font-bold tracking-wider uppercase text-[var(--palm)] flex items-center gap-1.5">
          <Palmtree className="w-3.5 h-3.5" />
          {t('homeSub')}
        </span>
        <h1 className="text-[27px] font-extrabold text-[var(--ink)] leading-tight tracking-tight">
          {t('homeTitle')}
        </h1>

      </header>

      {/* Shared Rootwise welcome with account-aware shortcuts */}
      <section className="rounded-3xl border border-[var(--palm)]/25 bg-gradient-to-br from-[#073d28] via-[#10563a] to-[#0c3440] p-4 text-white shadow-md overflow-hidden relative">
        <div className="absolute -right-8 -top-10 w-36 h-36 rounded-full border border-white/10" />
        <div className="absolute -right-2 -top-4 w-24 h-24 rounded-full border border-white/10" />
        <div className="relative flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <img src="/rootwise-mark.svg" alt="" aria-hidden="true" className="w-9 h-9 rounded-xl object-cover border border-white/20" />
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-emerald-200">ROOTWISE · PLANT INTELLIGENCE</p>
              <p className="text-[12px] text-white/75">{isSignedIn ? (lang === 'es' ? 'Tu espacio de cultivo' : 'Your growing space') : (lang === 'es' ? 'Explora. Identifica. Aprende. Cultiva.' : 'Explore. Identify. Learn. Grow.')}</p>
            </div>
          </div>
          <div>
            <h2 className="text-[23px] leading-tight font-extrabold tracking-tight">
              {isSignedIn
                ? `${lang === 'es' ? '¡Bienvenido de nuevo' : 'Welcome back'}${displayName ? `, ${displayName.split(' ')[0]}` : ''}.`
                : (lang === 'es' ? 'Todo empieza con una raíz.' : 'Every great garden starts at the roots.')}
            </h2>
            <p className="text-[12.5px] leading-relaxed text-white/80 mt-1 max-w-[34rem]">
              {isAdmin
                ? (lang === 'es' ? 'Tu espacio de administración está listo. Gestiona el catálogo, pedidos y conocimiento botánico.' : 'Your administrator workspace is ready. Manage the catalog, orders and botanical knowledge.')
                : isSignedIn
                  ? (lang === 'es' ? 'Continúa explorando plantas, guarda tus descubrimientos y mantén tus pedidos al día.' : 'Keep exploring plants, save your discoveries and stay on top of your orders.')
                  : (lang === 'es' ? 'Descubre plantas, identifica especies y encuentra conocimiento botánico confiable.' : 'Discover plants, identify species and explore trusted botanical knowledge.')}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-white/10 border border-white/10 px-2.5 py-2">
              <b className="block text-[18px] leading-none tabular-nums">{catalog.filter((c) => c.t === 'plant').length}</b>
              <span className="text-[10px] text-white/75">{lang === 'es' ? 'Plantas' : 'Plants'}</span>
            </div>
            <div className="rounded-xl bg-white/10 border border-white/10 px-2.5 py-2">
              <b className="block text-[18px] leading-none tabular-nums">{gardenCount}</b>
              <span className="text-[10px] text-white/75">{lang === 'es' ? 'Mi jardín' : 'My garden'}</span>
            </div>
            <div className="rounded-xl bg-white/10 border border-white/10 px-2.5 py-2">
              <b className="block text-[18px] leading-none tabular-nums">{activeOrdersCount || cartCount}</b>
              <span className="text-[10px] text-white/75">{activeOrdersCount ? (lang === 'es' ? 'Pedidos activos' : 'Active orders') : (lang === 'es' ? 'En carrito' : 'In cart')}</span>
            </div>
          </div>
          {isAdmin ? (
            <button type="button" onClick={() => onNavigate('account')} className="self-start inline-flex items-center gap-2 rounded-xl bg-[#f4c94d] px-4 py-2.5 text-[13px] font-extrabold text-[#153a29] shadow-sm active:scale-95 transition-transform">
              {lang === 'es' ? 'Abrir panel de administración' : 'Open administrator workspace'} <ChevronRight className="w-4 h-4" />
            </button>
          ) : isSignedIn ? (
            <div className="flex gap-2">
              <button type="button" onClick={() => onNavigate('account')} className="inline-flex items-center gap-2 rounded-xl bg-white px-3.5 py-2.5 text-[12px] font-extrabold text-[#12422f] active:scale-95 transition-transform">
                {lang === 'es' ? 'Mi jardín' : 'My garden'} <ChevronRight className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => onNavigate('request')} className="inline-flex items-center gap-2 rounded-xl border border-white/35 bg-white/10 px-3.5 py-2.5 text-[12px] font-bold text-white active:scale-95 transition-transform">
                {lang === 'es' ? 'Mis pedidos' : 'My orders'} <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => onNavigate('account')} className="self-start inline-flex items-center gap-2 rounded-xl bg-[#f4c94d] px-4 py-2.5 text-[13px] font-extrabold text-[#153a29] shadow-sm active:scale-95 transition-transform">
              {lang === 'es' ? 'Crear cuenta o iniciar sesión' : 'Create account or sign in'} <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </section>

      {/* Global Search Bar */}
      <form onSubmit={handleSearch} className="relative flex items-center">
        <Search className="absolute left-3.5 w-5 h-5 text-[var(--ink-soft)] pointer-events-none" />
        <input
          type="search"
          value={searchVal}
          onChange={(e) => setSearchVal(e.target.value)}
          placeholder={t('homeSearchPh')}
          className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-2xl pl-11 pr-4 py-3 text-[15px] focus:outline-none focus:border-[var(--lagoon)] focus:ring-2 focus:ring-[var(--lagoon)]/25 shadow-xs transition-all"
        />
      </form>

      {/* Quick Actions 2x2 Grid */}
      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() => onStartIdentify('pest')}
          className="flex flex-col items-start gap-2 text-left bg-[var(--surface)] hover:bg-[var(--surface-2)] active:scale-98 border border-[var(--line)] rounded-2xl p-3.5 transition-all shadow-xs group"
        >
          <span className="w-10 h-10 rounded-xl bg-[var(--bloom)]/15 text-[var(--bloom)] flex items-center justify-center group-hover:scale-105 transition-transform">
            <Bug className="w-5 h-5" />
          </span>
          <div>
            <b className="text-[15px] leading-tight block text-[var(--ink)]">{t('idBtnPest')}</b>
            <small className="text-[12px] text-[var(--ink-soft)] block leading-tight mt-0.5">
              {t('idBtnPestSub')}
            </small>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onStartIdentify('plant')}
          className="flex flex-col items-start gap-2 text-left bg-[var(--surface)] hover:bg-[var(--surface-2)] active:scale-98 border border-[var(--line)] rounded-2xl p-3.5 transition-all shadow-xs group"
        >
          <span className="w-10 h-10 rounded-xl bg-[var(--palm)]/15 text-[var(--palm)] flex items-center justify-center group-hover:scale-105 transition-transform">
            <Sprout className="w-5 h-5" />
          </span>
          <div>
            <b className="text-[15px] leading-tight block text-[var(--ink)]">{t('idBtnPlant')}</b>
            <small className="text-[12px] text-[var(--ink-soft)] block leading-tight mt-0.5">
              {t('idBtnPlantSub')}
            </small>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('plants')}
          className="flex flex-col items-start gap-2 text-left bg-[var(--surface)] hover:bg-[var(--surface-2)] active:scale-98 border border-[var(--line)] rounded-2xl p-3.5 transition-all shadow-xs group"
        >
          <span className="w-10 h-10 rounded-xl bg-[var(--sun)]/25 text-[#7c580d] flex items-center justify-center group-hover:scale-105 transition-transform">
            <Flower2 className="w-5 h-5" />
          </span>
          <div>
            <b className="text-[15px] leading-tight block text-[var(--ink)]">{t('shopBtn')}</b>
            <small className="text-[12px] text-[var(--ink-soft)] block leading-tight mt-0.5">
              {t('shopBtnSub')}
            </small>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('svc')}
          className="flex flex-col items-start gap-2 text-left bg-[var(--surface)] hover:bg-[var(--surface-2)] active:scale-98 border border-[var(--line)] rounded-2xl p-3.5 transition-all shadow-xs group"
        >
          <span className="w-10 h-10 rounded-xl bg-[var(--lagoon)]/15 text-[var(--lagoon)] flex items-center justify-center group-hover:scale-105 transition-transform">
            <Wrench className="w-5 h-5" />
          </span>
          <div>
            <b className="text-[15px] leading-tight block text-[var(--ink)]">{t('svcBtn')}</b>
            <small className="text-[12px] text-[var(--ink-soft)] block leading-tight mt-0.5">
              {t('svcBtnSub')}
            </small>
          </div>
        </button>
      </div>

      {/* AI Garden Advisor Feature Card */}
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
          className="bg-gradient-to-br from-[var(--surface)] via-[var(--surface-2)] to-emerald-500/10 border border-[var(--palm)]/35 rounded-2xl p-4 flex items-center justify-between gap-3 shadow-xs hover:border-[var(--palm)] cursor-pointer group transition-all"
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <span className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[var(--palm)] to-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform">
              <Sparkles className="w-6 h-6 text-amber-300 animate-pulse" />
            </span>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <b className="text-[15px] font-extrabold text-[var(--ink)] leading-snug">
                  {lang === 'es' ? 'Asesor Botánico con IA' : 'AI Garden Consultant'}
                </b>
                <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-[var(--palm)]/20 text-[var(--palm)]">
                  Rootwise AI
                </span>
              </div>
              <p className="text-[12px] text-[var(--ink-soft)] leading-snug mt-0.5">
                {lang === 'es'
                  ? 'Describa su suelo, sol y objetivos para recomendaciones directas de nuestro catálogo'
                  : 'Describe your soil, sunlight & goals for tailored plant & product matches'}
              </p>
            </div>
          </div>
          <span className="w-8 h-8 rounded-xl bg-[var(--surface)] border border-[var(--line)] flex items-center justify-center text-[var(--palm)] shrink-0 group-hover:translate-x-1 group-hover:bg-[var(--palm)] group-hover:text-white transition-all shadow-xs">
            <ChevronRight className="w-4 h-4" />
          </span>
        </div>
      )}

      {/* Botanical Knowledge Center Spotlight Card */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onNavigate('account')}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onNavigate('account');
          }
        }}
        className="bg-gradient-to-br from-[#12302A] via-[#1B6B4F] to-[#12808E] text-white rounded-2xl p-4 flex items-center justify-between gap-3 shadow-md cursor-pointer group transition-all"
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <span className="w-12 h-12 rounded-2xl bg-white/15 text-white flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform">
            <Compass className="w-6 h-6 text-emerald-300" />
          </span>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <b className="text-[15px] font-extrabold text-white leading-snug">
                {lang === 'es' ? 'Centro de Conocimiento Botánico' : 'Botanical Knowledge Center'}
              </b>
              <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-400 text-[#07201a]">
                RAG Engine
              </span>
            </div>
            <p className="text-[12px] text-white/80 leading-snug mt-0.5">
              {lang === 'es'
                ? 'Base taxonómica científica, libros botánicos indexados y recomendaciones regionales'
                : 'Scientific taxonomy, indexed botanical monographs & Caribbean regional intelligence'}
            </p>
          </div>
        </div>
        <span className="w-8 h-8 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-white shrink-0 group-hover:translate-x-1 group-hover:bg-white group-hover:text-[var(--palm)] transition-all">
          <ChevronRight className="w-4 h-4" />
        </span>
      </div>

      {/* Seasonal Tip Banner */}
      <div className="bg-[var(--note-bg)] text-[var(--note-ink)] border border-[var(--sun)]/30 rounded-2xl p-4 flex flex-col gap-2.5 shadow-xs">
        <div className="flex items-center gap-1.5 text-[11px] font-extrabold tracking-wider uppercase text-[var(--note-ink)]">
          <Sparkles className="w-3.5 h-3.5 text-[var(--sun)]" />
          {t('tipTitle')}
        </div>
        <p className="text-[13.5px] leading-relaxed text-[var(--note-ink)]">{t('tipText')}</p>
        <button
          type="button"
          onClick={() => onStartIdentify('pest')}
          className="self-start inline-flex items-center gap-1.5 bg-[var(--note-ink)] text-[var(--note-bg)] hover:opacity-90 active:scale-95 transition-all px-3 py-1.5 rounded-xl text-[13px] font-bold"
        >
          {t('checkSick')}
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Featured Island Plants Carousel */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-[18px] font-extrabold text-[var(--ink)]">{t('featuredPlants')}</h2>
          <button
            type="button"
            onClick={() => onNavigate('plants')}
            className="text-[13px] font-bold text-[var(--palm)] hover:underline inline-flex items-center gap-0.5"
          >
            {t('seeAll')}
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex gap-2.5 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1">
          {featured.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectItem(item)}
              className="flex-none w-[150px] flex flex-col gap-2 text-left bg-[var(--surface)] border border-[var(--line)] hover:border-[var(--palm)] rounded-2xl p-2.5 transition-all shadow-xs active:scale-98"
            >
              <div className="w-full aspect-4/3 rounded-xl overflow-hidden bg-[var(--surface-2)]">
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt={item.name}
                    className="w-full h-full object-cover transition-transform hover:scale-105 duration-300"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[var(--palm)]">
                    <Sprout className="w-8 h-8" />
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-0.5">
                <b className="text-[13.5px] leading-snug font-bold text-[var(--ink)] line-clamp-1">
                  {item.name}
                </b>
                <small className="text-[11px] text-[var(--ink-soft)] italic line-clamp-1">
                  {item.sci}
                </small>
                <div className="text-[13px] font-extrabold text-[var(--palm)] mt-0.5">
                  {formatMoney(item.price, item.currency)}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Landscapers Preview */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-[18px] font-extrabold text-[var(--ink)]">{t('localCrews')}</h2>
          <button
            type="button"
            onClick={() => onNavigate('svc')}
            className="text-[13px] font-bold text-[var(--palm)] hover:underline inline-flex items-center gap-0.5"
          >
            {t('seeAll')}
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {landscapers.slice(0, 2).map((crew) => (
            <div
              key={crew.id}
              className="flex items-center justify-between gap-3 bg-[var(--surface)] border border-[var(--line)] rounded-2xl p-3 shadow-xs"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-11 h-11 rounded-full bg-[var(--palm)] text-[var(--on-palm)] font-display font-extrabold flex items-center justify-center shrink-0">
                  {crew.ini}
                </span>
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-1.5">
                    <b className="text-[14.5px] leading-tight text-[var(--ink)] truncate">
                      {crew.name}
                    </b>
                    <span className="inline-flex items-center text-[12px] font-bold text-[var(--sun)]">
                      <Star className="w-3 h-3 fill-current mr-0.5" />
                      {crew.rate}
                    </span>
                  </div>
                  <small className="text-[12px] text-[var(--ink-soft)] truncate">{crew.areas}</small>
                  <small className="text-[11px] text-[var(--lagoon)] font-semibold mt-0.5">
                    {crew.reply}
                  </small>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onRequestQuote(crew)}
                className="shrink-0 bg-[var(--surface-2)] hover:bg-[var(--palm)] hover:text-white text-[var(--ink)] font-bold text-[12px] px-3 py-1.5 rounded-xl border border-[var(--line)] transition-all active:scale-95"
              >
                Quote
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
