import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({ isOpen, onClose, title, children }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Scrim */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/55 backdrop-blur-xs z-50 transition-opacity animate-fade-in"
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Dialog'}
        className="fixed left-0 right-0 bottom-0 mx-auto max-w-[440px] max-h-[90dvh] overflow-y-auto z-50 bg-[var(--surface)] text-[var(--ink)] rounded-t-3xl border border-[var(--line)] border-b-0 px-4 pt-3 pb-[calc(2rem_+_env(safe-area-inset-bottom,0px))] shadow-2xl transition-transform animate-in slide-in-from-bottom duration-200"
      >
        {/* Grab Handle */}
        <div className="w-10 h-1.5 rounded-full bg-[var(--line)] mx-auto mb-3" />

        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-4 w-8 h-8 rounded-full bg-[var(--surface-2)] text-[var(--ink-soft)] hover:text-[var(--ink)] flex items-center justify-center transition-all active:scale-95 text-lg font-bold"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Content */}
        <div className="mt-1">{children}</div>
      </div>
    </>
  );
};
