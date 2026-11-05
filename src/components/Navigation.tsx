import React from 'react';
import { motion } from 'motion/react';
import { Home, Leaf, ScanLine, Truck, User, Wrench } from 'lucide-react';
import { Language } from '../types';

export type TabType = 'home' | 'plants' | 'id' | 'svc' | 'request' | 'account';

interface NavigationProps {
  activeTab: TabType;
  onSelectTab: (tab: TabType) => void;
  cartCount: number;
  activeOrdersCount?: number;
  lang: Language;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onSelectTab,
  cartCount,
  activeOrdersCount = 0,
  lang
}) => {
  const tabs: Array<{ id: TabType; label: string; icon: React.ReactNode; isIdentify?: boolean }> = [
    {
      id: 'home',
      label: lang === 'es' ? 'Inicio' : 'Home',
      icon: <Home className="w-5 h-5" />
    },
    {
      id: 'plants',
      label: lang === 'es' ? 'Tienda' : 'Shop',
      icon: <Leaf className="w-5 h-5" />
    },
    {
      id: 'id',
      label: lang === 'es' ? 'Identificar' : 'Identify',
      icon: <ScanLine className="w-5 h-5" />,
      isIdentify: true
    },
    {
      id: 'svc',
      label: lang === 'es' ? 'Servicios' : 'Services',
      icon: <Wrench className="w-5 h-5" />
    },
    {
      id: 'request',
      label: lang === 'es' ? 'Entrega' : 'Delivery',
      icon: <Truck className="w-5 h-5" />
    },
    {
      id: 'account',
      label: lang === 'es' ? 'Cuenta' : 'Account',
      icon: <User className="w-5 h-5" />
    }
  ];

  return (
    <motion.nav
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="relative grid grid-cols-6 gap-0.5 bg-[var(--surface)]/95 backdrop-blur-md border border-[var(--line)] rounded-3xl p-1.5 mx-auto w-full max-w-[440px] my-1.5 shadow-lg shadow-black/5 z-40 select-none"
      role="tablist"
      aria-label="Main Navigation"
    >
      {tabs.map((tab) => {
        const isSelected = activeTab === tab.id;

        if (tab.isIdentify) {
          return (
            <motion.button
              key={tab.id}
              type="button"

              role="tab"
              aria-selected={isSelected}
              onClick={() => onSelectTab(tab.id)}
              whileTap={{ scale: 0.90 }}
              whileHover={{ y: -2 }}
              className="relative flex flex-col items-center justify-center p-1 group"
            >
              <div className="relative -mt-4">
                {/* Subtle ambient pulse ring around center identify button */}
                <motion.span
                  animate={{
                    scale: [1, 1.15, 1],
                    opacity: [0.35, 0.7, 0.35]
                  }}
                  transition={{
                    duration: 2.8,
                    repeat: Infinity,
                    ease: 'easeInOut'
                  }}
                  className="absolute inset-0 rounded-2xl bg-[var(--palm)]/30 blur-xs"
                />

                <span
                  className={`relative w-11 h-11 rounded-2xl flex items-center justify-center border-2 border-[var(--surface)] shadow-md transition-all ${
                    isSelected
                      ? 'bg-[var(--palm)] text-[var(--on-palm)] ring-2 ring-[var(--lagoon)] ring-offset-1'
                      : 'bg-[var(--palm)] text-[var(--on-palm)] hover:shadow-lg'
                  }`}
                >
                  <motion.div
                    animate={isSelected ? { rotate: [0, -8, 8, 0] } : {}}
                    transition={{ duration: 0.4 }}
                  >
                    {tab.icon}
                  </motion.div>
                </span>
              </div>

              <span
                className={`text-[10px] font-bold mt-0.5 truncate transition-colors ${
                  isSelected ? 'text-[var(--palm)] font-extrabold' : 'text-[var(--ink-soft)]'
                }`}
              >
                {tab.label}
              </span>
            </motion.button>
          );
        }

        return (
          <motion.button
            key={tab.id}
            role="tab"
            aria-selected={isSelected}
            onClick={() => onSelectTab(tab.id)}
            whileTap={{ scale: 0.92 }}
            whileHover={{ y: -1 }}
            className={`relative flex flex-col items-center justify-center py-1.5 px-0.5 rounded-2xl transition-colors ${
              isSelected ? 'text-[var(--palm)] font-bold' : 'text-[var(--ink-soft)] hover:text-[var(--ink)]'
            }`}
          >
            {/* Sliding spring active background pill */}
            {isSelected && (
              <motion.div
                layoutId="activeTabPill"
                className="absolute inset-0 bg-[var(--surface-2)] rounded-2xl shadow-xs"
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            )}

            <div className="relative z-10 flex flex-col items-center">
              <motion.div
                animate={isSelected ? { scale: [1, 1.12, 1] } : { scale: 1 }}
                transition={{ duration: 0.25 }}
              >
                {tab.icon}
              </motion.div>
              <span className="text-[10px] font-semibold mt-1 truncate">{tab.label}</span>
            </div>

            {/* Cart or Active Deliveries Badge with pop animation */}
            {tab.id === 'request' && cartCount > 0 && (
              <motion.span
                key={`cart-${cartCount}`}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                className="absolute top-1 right-2 z-20 min-w-[18px] h-[18px] rounded-full bg-[var(--bloom)] text-white text-[10px] font-extrabold flex items-center justify-center px-1 shadow-sm"
              >
                {cartCount}
              </motion.span>
            )}

            {tab.id === 'request' && cartCount === 0 && activeOrdersCount > 0 && (
              <motion.span
                key={`orders-${activeOrdersCount}`}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                className="absolute top-1 right-2 z-20 min-w-[18px] h-[18px] rounded-full bg-[var(--palm)] text-white text-[10px] font-extrabold flex items-center justify-center px-1 shadow-sm"
              >
                {activeOrdersCount}
              </motion.span>
            )}
          </motion.button>
        );
      })}
    </motion.nav>
  );
};
