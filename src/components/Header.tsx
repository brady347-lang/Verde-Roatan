import React from 'react';
import { motion } from 'motion/react';
import { MapPin, Palmtree } from 'lucide-react';
import { Language } from '../types';

interface HeaderProps {
  lang: Language;
  onToggleLang: () => void;
  zoneName: string;
  onOpenZonePicker: () => void;
  rateHnl: number | null;
  onToggleCurrencyWidget: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  lang,
  onToggleLang,
  zoneName,
  onOpenZonePicker,
  rateHnl,
  onToggleCurrencyWidget
}) => {
  return (
    <motion.header
      initial={{ y: -10, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="sticky top-0 z-40 flex items-center justify-between gap-1.5 pb-2.5 px-3 bg-[var(--surface)]/95 backdrop-blur-md border-b border-[var(--line)] flex-none shadow-xs"
      style={{ paddingTop: 'calc(0.625rem + env(safe-area-inset-top, 0px))' }}
    >
      {/* Brand */}
      <motion.div
        whileHover={{ scale: 1.02 }}
        className="flex items-center gap-2 font-display font-extrabold text-[17px] text-[var(--ink)] tracking-tight cursor-default"
      >
        <motion.span
          whileHover={{ rotate: 12 }}
          transition={{ type: 'spring', stiffness: 400, damping: 17 }}
          className="w-8 h-8 rounded-lg bg-[var(--palm)] text-[var(--on-palm)] flex items-center justify-center shadow-xs"
        >
          <Palmtree className="w-5 h-5 stroke-[2.2]" />
        </motion.span>
        <span className="truncate">Verde Roatán</span>
      </motion.div>

      {/* Top Actions with motion buttons */}
      <div className="flex items-center gap-1.5">
        {/* Language Switcher */}
        <motion.button
          type="button"
          onClick={onToggleLang}
          whileTap={{ scale: 0.90, rotate: -5 }}
          whileHover={{ scale: 1.05 }}
          title="Change language / Cambiar idioma"
          className="border border-[var(--line)] bg-[var(--surface)] hover:bg-[var(--surface-2)] transition-colors rounded-full px-2.5 py-1 text-[11px] font-extrabold text-[var(--ink-soft)] uppercase tracking-wider shadow-xs"
        >
          {lang === 'en' ? 'ES' : 'EN'}
        </motion.button>

        {/* Currency Pill */}
        <motion.button
          type="button"
          onClick={onToggleCurrencyWidget}
          whileTap={{ scale: 0.92 }}
          whileHover={{ scale: 1.04 }}
          title="BCH Exchange rate USD/HNL"
          className="inline-flex items-center gap-1.5 border border-[var(--line)] bg-[var(--surface)] hover:bg-[var(--surface-2)] transition-colors rounded-full px-2.5 py-1 text-[12px] font-bold text-[var(--palm)] shadow-xs"
        >
          <motion.span
            animate={{ scale: [1, 1.4, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="w-1.5 h-1.5 rounded-full bg-[var(--lagoon)]"
          />
          <span>{rateHnl ? `L ${rateHnl.toFixed(2)}` : '$ / L'}</span>
        </motion.button>

        {/* Delivery Area Button */}
        <motion.button
          type="button"
          onClick={onOpenZonePicker}
          whileTap={{ scale: 0.92 }}
          whileHover={{ scale: 1.03 }}
          aria-label="Select delivery area"
          className="inline-flex items-center gap-1.5 border border-[var(--line)] bg-[var(--surface)] hover:border-[var(--palm)] transition-colors rounded-full px-2.5 py-1 text-[12px] font-semibold text-[var(--ink)] max-w-[130px] shadow-xs"
        >
          <MapPin className="w-3.5 h-3.5 text-[var(--lagoon)] shrink-0" />
          <span className="truncate">{zoneName || (lang === 'en' ? 'Select area' : 'Elegir zona')}</span>
        </motion.button>
      </div>
    </motion.header>
  );
};
