import React from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  itemName: string;
  itemType: 'plant' | 'product' | 'landscaper';
}

export const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  itemName,
  itemType
}) => {
  if (!isOpen) return null;

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-xs z-60 transition-opacity"
        aria-hidden="true"
      />

      <div
        role="alertdialog"
        aria-modal="true"
        className="fixed left-0 right-0 bottom-0 mx-auto max-w-[440px] z-60 bg-[var(--surface)] text-[var(--ink)] rounded-t-3xl border border-[var(--line)] border-b-0 px-5 pt-4 pb-8 shadow-2xl animate-in slide-in-from-bottom duration-200"
      >
        <div className="w-10 h-1.5 rounded-full bg-[var(--line)] mx-auto mb-4" />

        <div className="flex flex-col items-center text-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center">
            <Trash2 className="w-7 h-7" />
          </div>

          <div className="flex flex-col gap-1">
            <h3 className="text-[19px] font-extrabold text-[var(--ink)]">{title}</h3>
            <p className="text-[13px] text-[var(--ink-soft)] leading-relaxed">
              Are you sure you want to permanently remove <strong className="text-[var(--ink)]">"{itemName}"</strong> from the database? This action cannot be undone.
            </p>
          </div>

          <div className="flex items-center gap-2.5 w-full mt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-2xl bg-[var(--surface-2)] text-[var(--ink)] font-bold text-[14px] hover:opacity-90 active:scale-95 transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className="flex-1 py-3 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-extrabold text-[14px] shadow-sm active:scale-95 transition-all flex items-center justify-center gap-1.5"
            >
              <Trash2 className="w-4 h-4" />
              Delete Permanently
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
