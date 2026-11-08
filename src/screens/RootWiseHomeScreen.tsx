import React from 'react';
import { ArrowUpRight, Activity, AlertTriangle, Compass, Leaf, ScanLine, Sparkles, Sprout, UserRound, Wrench } from 'lucide-react';
import { CatalogItem, GardenItem, Language } from '../types';

interface Props {
  lang: Language;
  displayName: string;
  gardenCount: number;
  plantCount: number;
  catalog: CatalogItem[];
  garden: GardenItem[];
  onNavigate: (tab: any) => void;
  onStartIdentify: () => void;
}

export const RootWiseHomeScreen: React.FC<Props> = ({
  lang, displayName, gardenCount, plantCount, catalog, garden, onNavigate, onStartIdentify
}) => {
  const es = lang === 'es';
  const featured = catalog.find((item) => item.t === 'plant' && item.image_url);
  const recentGarden = [...garden].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const plantObservations = recentGarden.filter((item) => item.mode === 'plant');
  const issueObservations = recentGarden.filter((item) => item.mode === 'pest');
  const latestIssue = issueObservations[0];
  const latestPlant = plantObservations[0];
  const latestDiagnosis = latestIssue?.data?.result?.primary_diagnosis;
  const latestSymptoms = latestIssue?.data?.result?.symptoms || [];
  const latestTreatment = latestIssue?.data?.result?.treatment || [];
  const latestPlantName = latestPlant?.data?.verified_botanical_record?.common_name || latestPlant?.name;
  const dateLabel = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(es ? 'es-HN' : 'en-US', { month: 'short', day: 'numeric' });
  };
  return (
    <div className="flex flex-col gap-5 pb-7">
      <header className="px-1"><p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-[var(--palm)]">{es ? 'TU ESPACIO PERSONAL' : 'YOUR PERSONAL SPACE'}</p><h1 className="text-2xl font-extrabold">My RootWise</h1><p className="mt-1 text-xs text-[var(--ink-soft)]">{es ? 'Tu jardín, tus observaciones y tu guía inteligente.' : 'Your garden, your observations and your intelligent guide.'}</p></header>
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
        <div className="flex items-end justify-between px-1"><div><p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-[var(--palm)]">{es ? 'INTELIGENCIA PERSONAL' : 'PERSONAL GARDEN INTELLIGENCE'}</p><h2 className="text-xl font-extrabold">{es ? 'Tu resumen RootWise' : 'Your RootWise overview'}</h2></div><span className="rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-[10px] font-bold text-[var(--ink-soft)]">{es ? 'BASADO EN TUS REGISTROS' : 'BASED ON YOUR RECORDS'}</span></div>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3"><Leaf className="h-4 w-4 text-[var(--palm)]"/><b className="mt-2 block text-2xl">{garden.length}</b><span className="text-[10px] text-[var(--ink-soft)]">{es ? 'Registros' : 'Records'}</span></div>
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3"><Sprout className="h-4 w-4 text-[var(--palm)]"/><b className="mt-2 block text-2xl">{plantObservations.length}</b><span className="text-[10px] text-[var(--ink-soft)]">{es ? 'Plantas' : 'Plants'}</span></div>
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3"><AlertTriangle className="h-4 w-4 text-amber-600"/><b className="mt-2 block text-2xl">{issueObservations.length}</b><span className="text-[10px] text-[var(--ink-soft)]">{es ? 'Revisiones' : 'Issue checks'}</span></div>
        </div>
      </section>
      <section className="rounded-3xl border border-[var(--palm)]/25 bg-[var(--surface)] p-4">
        <div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-[var(--palm)]"/><h2 className="text-base font-extrabold">{es ? 'Lo que RootWise observa' : 'What RootWise is noticing'}</h2></div>
        {latestIssue ? <div className="mt-3 rounded-2xl bg-[var(--surface-2)] p-3"><p className="text-[10px] font-extrabold uppercase tracking-wider text-amber-700">{es ? 'ÚLTIMA REVISIÓN DE SALUD' : 'LATEST HEALTH CHECK'} · {dateLabel(latestIssue.date)}</p><b className="mt-1 block text-sm">{latestDiagnosis || latestIssue.name}</b>{latestSymptoms.length > 0 && <p className="mt-1 text-xs text-[var(--ink-soft)]">{latestSymptoms.slice(0,3).join(' · ')}</p>}{latestIssue.data?.result?.likely_cause && <p className="mt-2 text-xs leading-relaxed"><b>{es ? 'Posible causa: ' : 'Possible cause: '}</b>{latestIssue.data.result.likely_cause}</p>}{latestTreatment.length > 0 && <p className="mt-2 text-xs leading-relaxed"><b>{es ? 'Siguiente paso: ' : 'Suggested next step: '}</b>{latestTreatment[0]}</p>}<p className="mt-2 text-[10px] text-[var(--ink-soft)]">{es ? 'Resumen de tu última evaluación guardada; no es una lectura en vivo.' : 'Summary of your latest saved assessment; this is not a live measurement.'}</p></div> : latestPlant ? <div className="mt-3 rounded-2xl bg-[var(--surface-2)] p-3"><p className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--palm)]">{es ? 'ÚLTIMA IDENTIFICACIÓN GUARDADA' : 'LATEST SAVED IDENTIFICATION'} · {dateLabel(latestPlant.date)}</p><b className="mt-1 block text-sm">{latestPlantName}</b><p className="mt-1 text-xs text-[var(--ink-soft)]">{es ? 'Sigue registrando observaciones para que RootWise pueda detectar cambios y ofrecer recomendaciones más útiles.' : 'Keep adding observations so RootWise can compare changes and make more useful recommendations.'}</p></div> : <div className="mt-3 rounded-2xl bg-[var(--surface-2)] p-3"><b className="text-sm">{es ? 'Aún estamos conociendo tu jardín.' : 'We are just getting to know your garden.'}</b><p className="mt-1 text-xs leading-relaxed text-[var(--ink-soft)]">{es ? 'Identifica una planta o registra un problema y guárdalo en tu jardín. Tus registros formarán la base de tus observaciones y recomendaciones.' : 'Identify a plant or check a plant problem and save it to your garden. Your records will power your observations and recommendations.'}</p><button onClick={onStartIdentify} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[var(--palm)] px-3 py-2 text-xs font-bold text-white">{es ? 'Comenzar identificación' : 'Start an identification'} <ArrowUpRight className="h-4 w-4"/></button></div>}
      </section>
      <section className="flex flex-col gap-3">
        <div><p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-[var(--palm)]">{es ? 'RECOMENDACIONES' : 'RECOMMENDATIONS'}</p><h2 className="text-lg font-extrabold">{es ? 'Qué hacer a continuación' : 'What to do next'}</h2></div>
        <div className="flex items-start gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3"><span className="rounded-xl bg-emerald-100 p-2 text-emerald-800"><Activity className="h-5 w-5"/></span><div className="min-w-0"><b className="text-sm">{latestTreatment.length ? (es ? 'Revisa el plan de cuidado más reciente' : 'Review your latest care guidance') : (es ? 'Registra una nueva observación' : 'Add a fresh garden observation')}</b><p className="mt-1 text-xs leading-relaxed text-[var(--ink-soft)]">{latestTreatment[0] || (es ? 'Una foto nueva y una breve nota ayudan a comparar la salud de tus plantas con el tiempo.' : 'A new photo and a short note help compare plant health over time.')}</p></div></div>
        {latestPlantName && <div className="flex items-start gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3"><span className="rounded-xl bg-lime-100 p-2 text-lime-800"><Sprout className="h-5 w-5"/></span><div><b className="text-sm">{es ? 'Continúa el seguimiento' : 'Continue tracking'}</b><p className="mt-1 text-xs text-[var(--ink-soft)]">{es ? 'Vuelve a observar' : 'Revisit'} {latestPlantName} {es ? 'y guarda una nueva foto para comparar su evolución.' : 'and save a new photo to compare its progress.'}</p></div></div>}
        <button onClick={() => onNavigate('id')} className="inline-flex w-fit items-center gap-2 rounded-xl bg-[var(--palm)] px-4 py-2.5 text-xs font-bold text-white">{es ? 'Registrar observación' : 'Record an observation'} <ArrowUpRight className="h-4 w-4"/></button>
      </section>
      <section className="flex flex-col gap-3">
        <div className="flex items-end justify-between"><div><p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-[var(--palm)]">{es ? 'HISTORIAL' : 'ACTIVITY HISTORY'}</p><h2 className="text-lg font-extrabold">{es ? 'Actividad reciente' : 'Recent activity'}</h2></div><span className="text-[10px] text-[var(--ink-soft)]">{garden.length} {es ? 'registros' : 'records'}</span></div>
        {recentGarden.length ? recentGarden.slice(0,4).map((item) => <div key={item.id} className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.mode === 'pest' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>{item.mode === 'pest' ? <AlertTriangle className="h-5 w-5"/> : <Leaf className="h-5 w-5"/>}</span><div className="min-w-0 flex-1"><b className="block truncate text-sm">{item.data?.verified_botanical_record?.common_name || item.name}</b><span className="text-[10px] text-[var(--ink-soft)]">{item.mode === 'pest' ? (es ? 'Revisión de plaga o problema' : 'Pest or plant issue check') : (es ? 'Identificación de planta' : 'Plant identification')} · {dateLabel(item.date)}</span></div><span className="text-[10px] font-semibold text-[var(--palm)]">{item.data?.status === 'success' ? (es ? 'Analizado' : 'Analyzed') : (es ? 'Guardado' : 'Saved')}</span></div>) : <p className="rounded-2xl bg-[var(--surface-2)] p-4 text-xs text-[var(--ink-soft)]">{es ? 'Tu historial aparecerá aquí cuando guardes tus primeras observaciones.' : 'Your history will appear here after you save your first observations.'}</p>}
      </section>
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3">
        <button onClick={() => onNavigate('account')} className="flex w-full items-center gap-3 text-left"><span className="rounded-xl bg-[var(--surface-2)] p-2 text-[var(--ink-soft)]"><UserRound className="h-5 w-5"/></span><span className="flex-1"><b className="block text-sm">{es ? 'Configuración de cuenta' : 'Account settings'}</b><small className="text-xs text-[var(--ink-soft)]">{es ? 'Datos personales, seguridad y preferencias' : 'Personal details, security and preferences'}</small></span><ArrowUpRight className="h-4 w-4 text-[var(--ink-soft)]"/></button>
      </section>
      <section className="flex flex-col gap-3">
        <div><p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-[var(--palm)]">{es ? 'HERRAMIENTAS ROOTWISE' : 'ROOTWISE TOOLS'}</p><h2 className="text-lg font-extrabold">{es ? 'Sigue trabajando en tu espacio verde' : 'Keep working on your green space'}</h2></div>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => onNavigate('tools')} className="flex min-h-28 flex-col items-start justify-between rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3 text-left"><Wrench className="h-5 w-5 text-[var(--palm)]"/><span><b className="block text-sm">{es ? 'Herramientas' : 'Landscape tools'}</b><small className="text-xs text-[var(--ink-soft)]">{es ? 'Medir y planificar' : 'Measure and plan'}</small></span></button>
          <button onClick={() => onNavigate('explore')} className="flex min-h-28 flex-col items-start justify-between rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3 text-left"><Compass className="h-5 w-5 text-sky-700"/><span><b className="block text-sm">{es ? 'Explorar' : 'Explore'}</b><small className="text-xs text-[var(--ink-soft)]">{es ? 'Servicios y catálogo' : 'Services and catalog'}</small></span></button>
        </div>
      </section>
    </div>
  );
};
