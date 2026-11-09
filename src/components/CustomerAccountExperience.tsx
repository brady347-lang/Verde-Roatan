import React, { useState } from 'react';
import { ArrowRight, BookOpen, Camera, Compass, Leaf, MapPin, Package, Sparkles } from 'lucide-react';
import { Language } from '../types';

type Props = {
  lang: Language;
  displayName: string;
  gardenCount: number;
  orderCount: number;
  onNavigate: (tab: string) => void;
};

const GUIDES = [
  { title: 'Explore the catalog', esTitle: 'Explorar el catálogo', description: 'Browse approved plants and nursery products, compare photos and details, then add what you need to your delivery request.', esDescription: 'Explora plantas y productos aprobados, compara fotos y detalles y añade lo que necesitas a tu solicitud de entrega.', tab: 'explore', icon: Compass, action: 'Open catalog', esAction: 'Abrir catálogo' },
  { title: 'Identify a plant', esTitle: 'Identificar una planta', description: 'Take a clear photo of a plant or a plant-health issue. RootWise will explain likely matches and useful next steps.', esDescription: 'Toma una foto clara de una planta o un problema de salud. RootWise explicará las coincidencias y los siguientes pasos.', tab: 'id', icon: Camera, action: 'Start identification', esAction: 'Iniciar identificación' },
  { title: 'Measure your garden', esTitle: 'Medir tu jardín', description: 'Walk a boundary with GPS, switch between the map and green plot diagram, and save the measurements on this device.', esDescription: 'Camina el perímetro con GPS, alterna entre el mapa y el diagrama verde y guarda las medidas en este dispositivo.', tab: 'tools', icon: MapPin, action: 'Open measuring tools', esAction: 'Abrir herramientas' },
  { title: 'Keep your garden history', esTitle: 'Guardar el historial de tu jardín', description: 'Save plant observations and return to your personal garden records whenever you need them.', esDescription: 'Guarda observaciones de plantas y vuelve a tus registros personales cuando los necesites.', tab: 'my-rootwise', icon: Leaf, action: 'Open My RootWise', esAction: 'Abrir Mi RootWise' },
  { title: 'Follow your delivery', esTitle: 'Seguir tu entrega', description: 'Review your delivery request and order updates from your customer account.', esDescription: 'Consulta tu solicitud de entrega y las actualizaciones del pedido desde tu cuenta de cliente.', tab: 'request', icon: Package, action: 'View orders', esAction: 'Ver pedidos' }
] as const;

export const CustomerAccountExperience: React.FC<Props> = ({ lang, displayName, gardenCount, orderCount, onNavigate }) => {
  const es = lang === 'es';
  const [guideIndex, setGuideIndex] = useState<number | null>(null);
  const guide = guideIndex === null ? null : GUIDES[guideIndex];
  return (
    <section className="flex flex-col gap-3">
      <div className="rounded-3xl bg-[#0b3829] p-4 text-white">
        <div className="flex items-center gap-2 text-emerald-200"><Sparkles className="h-5 w-5"/><span className="text-[10px] font-extrabold tracking-[.16em]">ROOTWISE CUSTOMER COMPANION</span></div>
        <h2 className="mt-2 text-xl font-extrabold">{es ? `Tu espacio de cliente${displayName ? ', ' + displayName.split(' ')[0] : ''}` : `Your customer space${displayName ? ', ' + displayName.split(' ')[0] : ''}`}</h2>
        <p className="mt-1 text-xs leading-relaxed text-white/75">{es ? 'Te acompaño paso a paso para descubrir plantas, entender tus herramientas y gestionar tus pedidos. No necesitas un perfil de proveedor ni subir fotos de negocio.' : 'I can guide you step by step through plants, tools and orders. You do not need a supplier profile or business photos to use RootWise as a customer.'}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-white/10 p-3"><b className="text-2xl">{gardenCount}</b><p className="text-[10px] text-white/70">{es ? 'Registros de jardín' : 'Garden records'}</p></div>
          <div className="rounded-xl bg-white/10 p-3"><b className="text-2xl">{orderCount}</b><p className="text-[10px] text-white/70">{es ? 'Pedidos' : 'Orders'}</p></div>
        </div>
        <button type="button" onClick={() => setGuideIndex(0)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-3 py-3 text-xs font-extrabold text-[#0b3829]"><BookOpen className="h-4 w-4"/>{es ? 'Iniciar guía paso a paso' : 'Start the guided tour'}</button>
      </div>
      {guide && <div className="rounded-2xl border border-[var(--palm)]/30 bg-[var(--surface)] p-4">
        <div className="flex items-center justify-between"><span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--palm)]">{es ? 'GUÍA DEL ACOMPAÑANTE' : 'COMPANION GUIDE'} · {guideIndex! + 1}/{GUIDES.length}</span><button type="button" onClick={() => setGuideIndex(null)} className="text-xs font-bold text-[var(--ink-soft)]">{es ? 'Cerrar' : 'Close'}</button></div>
        <div className="mt-3 flex items-center gap-2"><guide.icon className="h-5 w-5 text-[var(--palm)]"/><b className="text-sm">{es ? guide.esTitle : guide.title}</b></div>
        <p className="mt-2 text-xs leading-relaxed text-[var(--ink-soft)]">{es ? guide.esDescription : guide.description}</p>
        <button type="button" onClick={() => onNavigate(guide.tab)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--palm)] px-3 py-2.5 text-xs font-bold text-white">{es ? guide.esAction : guide.action}<ArrowRight className="h-4 w-4"/></button>
        <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" disabled={guideIndex === 0} onClick={() => setGuideIndex(index => Math.max(0, (index ?? 0) - 1))} className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-bold disabled:opacity-40">{es ? 'Anterior' : 'Previous'}</button><button type="button" onClick={() => setGuideIndex(index => index === GUIDES.length - 1 ? null : (index ?? 0) + 1)} className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-bold">{guideIndex === GUIDES.length - 1 ? (es ? 'Finalizar' : 'Finish') : (es ? 'Siguiente' : 'Next')}</button></div>
      </div>}
      <div className="grid grid-cols-2 gap-2">
        {GUIDES.map((item, index) => <button key={item.tab} type="button" onClick={() => onNavigate(item.tab)} className="flex items-center gap-2 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3 text-left"><item.icon className="h-4 w-4 shrink-0 text-[var(--palm)]"/><span className="text-xs font-bold">{es ? item.esTitle : item.title}</span></button>)}
      </div>
    </section>
  );
};
