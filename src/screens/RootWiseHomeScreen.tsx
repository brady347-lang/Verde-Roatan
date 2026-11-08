import React from 'react';
import { ArrowUpRight, Compass, Flower2, Leaf, Map, ScanLine, Sparkles, Sprout, Users, Wrench } from 'lucide-react';
import { CatalogItem, Language } from '../types';

interface Props {
  lang: Language;
  displayName: string;
  gardenCount: number;
  plantCount: number;
  catalog: CatalogItem[];
  onNavigate: (tab: any) => void;
  onStartIdentify: () => void;
}

export const RootWiseHomeScreen: React.FC<Props> = ({
  lang, displayName, gardenCount, plantCount, catalog, onNavigate, onStartIdentify
}) => {
  const es = lang === 'es';
  const featured = catalog.find((item) => item.t === 'plant' && item.image_url);
  return (
    <div className="flex flex-col gap-5 pb-7">
      <section className="relative overflow-hidden rounded-[28px] min-h-[250px] bg-[#0b3829] text-white shadow-lg">
        {featured?.image_url && <img src={featured.image_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" />}
        <div className="absolute inset-0 bg-gradient-to-br from-[#092f23]/95 via-[#0d4a34]/90 to-[#102f35]/80" />
        <div className="absolute -right-12 -top-16 h-64 w-64 rounded-full border border-white/10" />
        <div className="absolute -right-2 -top-7 h-44 w-44 rounded-full border border-white/10" />
        <div className="relative z-10 flex flex-col gap-4 p-5">
          <div className="flex items-center gap-2">
            <img src="/rootwise-mark.svg" alt="" className="h-10 w-10 rounded-xl border border-white/20 object-cover" />
            <div><p className="text-[10px] font-bold tracking-[.2em] text-emerald-200">ROOTWISE</p><p className="text-xs text-white/70">{es ? 'INTELIGENCIA BOTÁNICA Y PAISAJISMO' : 'BOTANICAL & LANDSCAPE INTELLIGENCE'}</p></div>
          </div>
          <div>
            <p className="text-xs font-semibold text-emerald-200">{es ? 'BIENVENIDO' : 'WELCOME'}{displayName ? `, ${displayName.split(' ')[0].toUpperCase()}` : ''}</p>
            <h1 className="mt-1 max-w-[18rem] text-[30px] font-extrabold leading-[1.05] tracking-tight">{es ? 'Diseña. Cultiva. Transforma.' : 'Design. Grow. Transform.'}</h1>
            <p className="mt-2 max-w-[19rem] text-sm leading-relaxed text-white/75">{es ? 'Herramientas profesionales e inteligencia botánica para cada espacio verde.' : 'Professional tools and botanical intelligence for every green space.'}</p>
          </div>
          <button type="button" onClick={() => onNavigate('tools')} className="inline-flex w-fit items-center gap-2 rounded-xl bg-[#d7e8a5] px-4 py-3 text-sm font-extrabold text-[#173b2c] active:scale-95">
            {es ? 'Explorar herramientas' : 'Explore professional tools'} <ArrowUpRight className="h-4 w-4" />
          </button>
          <div className="flex gap-5 border-t border-white/15 pt-3 text-xs text-white/75">
            <span><b className="block text-lg text-white">{plantCount}</b>{es ? 'Plantas' : 'Plants'}</span>
            <span><b className="block text-lg text-white">{gardenCount}</b>{es ? 'Mi jardín' : 'My garden'}</span>
            <span><b className="block text-lg text-white">01</b>{es ? 'Plataforma' : 'Platform'}</span>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-end justify-between px-1"><div><p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-[var(--palm)]">{es ? 'ESPACIO DE TRABAJO' : 'YOUR WORKSPACE'}</p><h2 className="text-xl font-extrabold">{es ? '¿Qué necesitas hacer?' : 'What would you like to do?'}</h2></div></div>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => onNavigate('tools')} className="flex min-h-32 flex-col items-start justify-between rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 text-left shadow-sm active:scale-[.98]"><span className="rounded-xl bg-emerald-100 p-2.5 text-emerald-800"><Wrench className="h-5 w-5" /></span><span><b className="block text-sm">{es ? 'Herramientas' : 'Landscape tools'}</b><small className="text-xs text-[var(--ink-soft)]">{es ? 'Medir, planificar y calcular' : 'Measure, plan and calculate'}</small></span></button>
          <button onClick={onStartIdentify} className="flex min-h-32 flex-col items-start justify-between rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 text-left shadow-sm active:scale-[.98]"><span className="rounded-xl bg-lime-100 p-2.5 text-lime-800"><ScanLine className="h-5 w-5" /></span><span><b className="block text-sm">{es ? 'Identificar' : 'Identify a plant'}</b><small className="text-xs text-[var(--ink-soft)]">{es ? 'Plantas y problemas' : 'Plants and plant problems'}</small></span></button>
          <button onClick={() => onNavigate('explore')} className="flex min-h-32 flex-col items-start justify-between rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 text-left shadow-sm active:scale-[.98]"><span className="rounded-xl bg-sky-100 p-2.5 text-sky-800"><Compass className="h-5 w-5" /></span><span><b className="block text-sm">{es ? 'Explorar' : 'Explore RootWise'}</b><small className="text-xs text-[var(--ink-soft)]">{es ? 'Catálogo y conocimiento' : 'Catalog and knowledge'}</small></span></button>
          <button onClick={() => onNavigate('account')} className="flex min-h-32 flex-col items-start justify-between rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 text-left shadow-sm active:scale-[.98]"><span className="rounded-xl bg-amber-100 p-2.5 text-amber-800"><Sprout className="h-5 w-5" /></span><span><b className="block text-sm">{es ? 'Mi RootWise' : 'My RootWise'}</b><small className="text-xs text-[var(--ink-soft)]">{es ? 'Jardín y cuenta' : 'Garden and account'}</small></span></button>
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--surface)]">
        <div className="flex items-center justify-between px-4 pt-4"><div><p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-[var(--palm)]">{es ? 'INSPIRACIÓN' : 'FIELD NOTES'}</p><h2 className="text-lg font-extrabold">{es ? 'Ideas para espacios vivos' : 'Ideas for living spaces'}</h2></div><Flower2 className="h-6 w-6 text-[var(--palm)]" /></div>
        <div className="grid grid-cols-2 gap-3 p-3">
          <div className="relative flex min-h-36 flex-col justify-end overflow-hidden rounded-2xl bg-gradient-to-br from-[#315c3c] to-[#a3b875] p-3 text-white"><div className="absolute -right-4 -top-5 h-24 w-24 rounded-full border border-white/25" /><span className="relative text-[10px] font-bold uppercase tracking-wider text-white/75">{es ? 'DISEÑO TROPICAL' : 'TROPICAL DESIGN'}</span><b className="relative mt-1 text-sm leading-tight">{es ? 'Capas de vegetación para profundidad' : 'Layered planting for depth'}</b></div>
          <div className="relative flex min-h-36 flex-col justify-end overflow-hidden rounded-2xl bg-gradient-to-br from-[#174b55] to-[#79a9a0] p-3 text-white"><div className="absolute -right-5 -top-5 h-28 w-28 rounded-full border border-white/25" /><span className="relative text-[10px] font-bold uppercase tracking-wider text-white/75">{es ? 'PAISAJISMO' : 'LANDSCAPING'}</span><b className="relative mt-1 text-sm leading-tight">{es ? 'Espacios exteriores que prosperan' : 'Outdoor spaces that thrive'}</b></div>
        </div>
      </section>

      <section className="rounded-3xl border border-dashed border-[var(--palm)]/40 bg-[var(--surface)] p-4">
        <div className="flex items-center gap-2"><Users className="h-5 w-5 text-[var(--palm)]" /><p className="text-xs font-extrabold uppercase tracking-wider text-[var(--palm)]">{es ? 'COMUNIDAD ROOTWISE' : 'ROOTWISE COMMUNITY'}</p><span className="ml-auto rounded-full bg-[var(--surface-2)] px-2 py-1 text-[9px] font-bold text-[var(--ink-soft)]">{es ? 'PRÓXIMAMENTE' : 'COMING SOON'}</span></div>
        <h2 className="mt-2 text-lg font-extrabold">{es ? 'Comparte lo que estás creando.' : 'Share what you are growing.'}</h2>
        <p className="mt-1 text-sm leading-relaxed text-[var(--ink-soft)]">{es ? 'Historias, proyectos terminados, fotos del antes y después y descubrimientos de plantas. Estamos preparando un espacio para profesionales y amantes de las plantas.' : 'Stories, finished projects, before-and-after photos and plant discoveries. We are preparing a space for professionals and plant lovers.'}</p>
        <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-[var(--palm)]"><Sparkles className="h-4 w-4" />{es ? 'Un espacio para aprender juntos' : 'A place to learn and grow together'}</div>
      </section>
    </div>
  );
};
