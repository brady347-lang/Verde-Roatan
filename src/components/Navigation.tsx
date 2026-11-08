import React from 'react';
import { motion } from 'motion/react';
import { Compass, Home, Leaf, ScanLine, UserRound, Wrench } from 'lucide-react';
import { Language } from '../types';

export type TabType = 'home' | 'tools' | 'explore' | 'plants' | 'id' | 'svc' | 'request' | 'account';

interface NavigationProps {
  activeTab: TabType;
  onSelectTab: (tab: TabType) => void;
  cartCount: number;
  activeOrdersCount?: number;
  lang: Language;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab, onSelectTab, cartCount, activeOrdersCount = 0, lang
}) => {
  const tabs: Array<{ id: TabType; label: string; icon: React.ReactNode; featured?: boolean }> = [
    { id: 'home', label: lang === 'es' ? 'Inicio' : 'Home', icon: <Home className="h-5 w-5" /> },
    { id: 'explore', label: lang === 'es' ? 'Explorar' : 'Explore', icon: <Compass className="h-5 w-5" /> },
    { id: 'id', label: lang === 'es' ? 'Identificar' : 'Identify', icon: <ScanLine className="h-5 w-5" />, featured: true },
    { id: 'tools', label: lang === 'es' ? 'Herramientas' : 'Tools', icon: <Wrench className="h-5 w-5" /> },
    { id: 'account', label: lang === 'es' ? 'Perfil' : 'Profile', icon: <UserRound className="h-5 w-5" /> }
  ];
  const exploreActive = ['explore', 'plants', 'svc', 'request'].includes(activeTab);

  return (
    <motion.nav initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.35, ease: 'easeOut' }}
      className="relative grid grid-cols-5 gap-1 bg-[var(--surface)]/95 backdrop-blur-md border border-[var(--line)] rounded-3xl p-1.5 mx-auto w-full max-w-[440px] my-1.5 shadow-lg shadow-black/5 z-40 select-none"
      role="tablist" aria-label="RootWise navigation">
      {tabs.map((item) => {
        const selected = item.id === 'explore' ? exploreActive : activeTab === item.id;
        return (
          <motion.button key={item.id} type="button" role="tab" aria-selected={selected}
            onClick={() => onSelectTab(item.id)} whileTap={{ scale: 0.92 }} whileHover={{ y: -1 }}
            className={`relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl py-2 px-0.5 transition-colors ${selected ? 'text-[var(--palm)] font-bold' : 'text-[var(--ink-soft)] hover:text-[var(--ink)]'}`}>
            {selected && <motion.div layoutId="activeTabPill" className="absolute inset-0 rounded-2xl bg-[var(--surface-2)] shadow-xs" transition={{ type: 'spring', stiffness: 500, damping: 35 }} />}
            <span className={`relative z-10 flex h-6 items-center justify-center ${item.featured ? 'text-[var(--palm)]' : ''}`}>{item.icon}</span>
            <span className="relative z-10 max-w-full truncate text-[9.5px] font-semibold">{item.label}</span>
            {item.id === 'explore' && cartCount > 0 && <span className="absolute right-1 top-0 z-20 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-[var(--bloom)] px-1 text-[9px] font-extrabold text-white">{cartCount}</span>}
            {item.id === 'explore' && cartCount === 0 && activeOrdersCount > 0 && <span className="absolute right-1 top-0 z-20 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-[var(--palm)] px-1 text-[9px] font-extrabold text-white">{activeOrdersCount}</span>}
          </motion.button>
        );
      })}
    </motion.nav>
  );
};
