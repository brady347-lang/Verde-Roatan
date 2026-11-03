import React, { useEffect, useRef, useState } from 'react';
import { Minus, Plus, X } from 'lucide-react';
import { BchRateResponse } from '../services/api';

interface CurrencyWidgetProps {
  rateData: BchRateResponse | null;
  isOpen: boolean;
  onClose: () => void;
}

export const CurrencyWidget: React.FC<CurrencyWidgetProps> = ({ rateData, isOpen, onClose }) => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('verdeFxCollapsed') !== '0';
  });
  const [pos, setPos] = useState<{ left?: number; top?: number; right?: number; bottom?: number }>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('verdeFxPosition') || 'null');
      if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
        return { left: saved.left, top: saved.top };
      }
    } catch {}
    return { right: 16, bottom: 92 };
  });

  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; initLeft: number; initTop: number } | null>(null);
  const widgetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('verdeFxCollapsed', isCollapsed ? '1' : '0');
  }, [isCollapsed]);

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    if (!widgetRef.current) return;
    const rect = widgetRef.current.getBoundingClientRect();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initLeft: rect.left,
      initTop: rect.top
    };
    setIsDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current || !widgetRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const width = widgetRef.current.offsetWidth;
    const height = widgetRef.current.offsetHeight;

    const newLeft = Math.max(8, Math.min(window.innerWidth - width - 8, dragRef.current.initLeft + dx));
    const newTop = Math.max(8, Math.min(window.innerHeight - height - 8, dragRef.current.initTop + dy));

    setPos({ left: newLeft, top: newTop });
  };

  const onPointerUp = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setIsDragging(false);
    if (pos.left !== undefined && pos.top !== undefined) {
      try {
        localStorage.setItem('verdeFxPosition', JSON.stringify({ left: pos.left, top: pos.top }));
      } catch {}
    }
  };

  if (!isOpen) return null;

  const rate = rateData?.hnlPerUsd ?? 26;
  const usdRate = rate.toFixed(4);
  const oneHnlInUsd = (1 / rate).toFixed(4);

  const style: React.CSSProperties = {
    position: 'fixed',
    zIndex: 90,
    ...(pos.left !== undefined ? { left: `${pos.left}px` } : {}),
    ...(pos.top !== undefined ? { top: `${pos.top}px` } : {}),
    ...(pos.right !== undefined && pos.left === undefined ? { right: `${pos.right}px` } : {}),
    ...(pos.bottom !== undefined && pos.top === undefined ? { bottom: `${pos.bottom}px` } : {})
  };

  return (
    <aside
      ref={widgetRef}
      style={style}
      className={`rounded-2xl text-[#f4fff8] bg-linear-to-br from-[#14543d] to-[#082d23] border border-white/20 shadow-xl transition-all select-none ${
        isCollapsed ? 'w-auto min-w-[90px]' : 'w-[185px]'
      } ${isDragging ? 'opacity-90 scale-102 shadow-2xl' : ''}`}
      aria-label="Live BCH exchange rate"
    >
      {/* Drag Header */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="flex items-center justify-between gap-1.5 px-2.5 py-1.5 cursor-grab active:cursor-grabbing touch-none"
      >
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#c0e2d0] truncate">
          <span className="w-1.5 h-1.5 rounded-full bg-[#66e3a0] shrink-0 animate-pulse" />
          <span>{isCollapsed ? `L ${rate.toFixed(2)}` : 'USD / HNL'}</span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsCollapsed(!isCollapsed);
            }}
            title={isCollapsed ? 'Expand rate widget' : 'Collapse widget'}
            className="w-5 h-5 rounded flex items-center justify-center bg-white/10 hover:bg-white/25 active:scale-90 text-white transition-all text-xs"
          >
            {isCollapsed ? <Plus className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            title="Hide widget"
            className="w-5 h-5 rounded flex items-center justify-center bg-white/10 hover:bg-red-500/80 active:scale-90 text-white transition-all text-xs"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Expanded Body */}
      {!isCollapsed && (
        <div className="px-3 pb-2.5 pt-0.5 text-center">
          <div className="font-display font-black text-[19px] leading-tight tabular-nums my-0.5 text-white">
            {usdRate}
          </div>
          <div className="text-[9.5px] text-[#d5eadf] font-medium leading-none">
            Lempiras per US Dollar
          </div>

          <div className="h-px bg-white/15 my-2" />

          <div className="flex justify-between items-center text-[10.5px] text-[#d5eadf] mb-0.5">
            <span>1 USD</span>
            <b className="text-white tabular-nums">L {usdRate}</b>
          </div>
          <div className="flex justify-between items-center text-[10.5px] text-[#d5eadf]">
            <span>1 HNL</span>
            <b className="text-white tabular-nums">$ {oneHnlInUsd}</b>
          </div>

          <div className="text-[8.5px] leading-tight text-[#c0e2d0] mt-2 pt-1 border-t border-white/10 opacity-80">
            {rateData?.source || 'BCH'} · {rateData?.rateDate || 'Official rate'}
          </div>
        </div>
      )}
    </aside>
  );
};
