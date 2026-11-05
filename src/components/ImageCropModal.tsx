import React, { useEffect, useRef, useState } from 'react';
import {
  Crop,
  Maximize2,
  Minimize2,
  RotateCcw,
  Sparkles,
  X,
  ZoomIn,
  ZoomOut
} from 'lucide-react';

interface ImageCropModalProps {
  imageSrc: string;
  isOpen: boolean;
  onClose: () => void;
  onCropComplete: (croppedDataUrl: string) => void;
  lang: 'en' | 'es';
  mode: 'plant' | 'pest';
}

export const ImageCropModal: React.FC<ImageCropModalProps> = ({
  imageSrc,
  isOpen,
  onClose,
  onCropComplete,
  lang,
  mode
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Reset state when a new image is loaded
  useEffect(() => {
    if (isOpen) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setIsProcessing(false);
    }
  }, [isOpen, imageSrc]);

  if (!isOpen) return null;

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    try {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Extract the cropped square from the visible viewport
  const handlePerformCrop = (useFull = false) => {
    setIsProcessing(true);
    const img = imgRef.current;
    if (!img) {
      setIsProcessing(false);
      onCropComplete(imageSrc);
      return;
    }

    try {
      if (useFull) {
        // Fast-downsample the entire photo
        const canvas = document.createElement('canvas');
        const maxDim = 800;
        let w = img.naturalWidth || 800;
        let h = img.naturalHeight || 800;
        if (w > h && w > maxDim) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else if (h > maxDim) {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
          setIsProcessing(false);
          onCropComplete(dataUrl);
          return;
        }
        setIsProcessing(false);
        onCropComplete(imageSrc);
        return;
      }

      // Compute cropped area corresponding to the square focus window
      const container = containerRef.current;
      if (!container) {
        setIsProcessing(false);
        onCropComplete(imageSrc);
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const focusSize = Math.min(containerRect.width, containerRect.height) * 0.85;

      // Determine where the image is rendered relative to container center
      const imgWidth = img.clientWidth * zoom;
      const imgHeight = img.clientHeight * zoom;

      const imgLeftInContainer = (containerRect.width - imgWidth) / 2 + pan.x;
      const imgTopInContainer = (containerRect.height - imgHeight) / 2 + pan.y;

      const focusLeftInContainer = (containerRect.width - focusSize) / 2;
      const focusTopInContainer = (containerRect.height - focusSize) / 2;

      // Map focus box back to natural image coordinates
      const scaleX = (img.naturalWidth || imgWidth) / imgWidth;
      const scaleY = (img.naturalHeight || imgHeight) / imgHeight;

      const sourceX = Math.max(0, (focusLeftInContainer - imgLeftInContainer) * scaleX);
      const sourceY = Math.max(0, (focusTopInContainer - imgTopInContainer) * scaleY);
      const sourceW = Math.min(img.naturalWidth - sourceX, focusSize * scaleX);
      const sourceH = Math.min(img.naturalHeight - sourceY, focusSize * scaleY);

      const targetDim = 640;
      const canvas = document.createElement('canvas');
      canvas.width = targetDim;
      canvas.height = targetDim;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        setIsProcessing(false);
        onCropComplete(imageSrc);
        return;
      }

      // Fill with smooth background in case edges are visible
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, targetDim, targetDim);

      ctx.drawImage(
        img,
        sourceX,
        sourceY,
        sourceW,
        sourceH,
        0,
        0,
        targetDim,
        targetDim
      );

      const croppedUrl = canvas.toDataURL('image/jpeg', 0.78);
      setIsProcessing(false);
      onCropComplete(croppedUrl);
    } catch (err) {
      console.warn('Canvas cropping failed, using fallback compressed image:', err);
      setIsProcessing(false);
      onCropComplete(imageSrc);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 pt-[max(0.75rem,env(safe-area-inset-top,0px))] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-md bg-[var(--surface)] text-[var(--ink)] rounded-3xl shadow-2xl border border-[var(--line)] overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-[var(--line)] bg-[var(--surface-2)]">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-xl bg-[var(--palm)]/15 text-[var(--palm)]">
              <Crop className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-[15px] font-extrabold text-[var(--ink)] leading-tight">
                {lang === 'es' ? 'Enfocar Muestra' : 'Focus Specimen'}
              </h2>
              <p className="text-[11px] text-[var(--ink-soft)]">
                {mode === 'pest'
                  ? lang === 'es'
                    ? 'Aísla la plaga, hoja afectada o daño'
                    : 'Isolate the affected leaf, bug, or rot'
                  : lang === 'es'
                  ? 'Centra la flor, hoja o fruto para máxima precisión'
                  : 'Center leaf, flower, or frond for instant AI match'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-[var(--line)] text-[var(--ink-soft)] transition-colors"
            aria-label="Close cropper"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewport Frame with Touch/Mouse Dragging */}
        <div
          ref={containerRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="relative w-full h-[320px] bg-neutral-950 overflow-hidden cursor-grab active:cursor-grabbing select-none flex items-center justify-center touch-none"
        >
          {/* Scaled & Panned Image */}
          <img
            ref={imgRef}
            src={imageSrc}
            alt="Specimen to crop"
            draggable={false}
            className="pointer-events-none max-w-none transition-transform duration-75 ease-out select-none"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'center center',
              maxHeight: '300px'
            }}
          />

          {/* Vignette / Crop Window Overlay */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            {/* Dark mask outside square */}
            <div
              className="relative w-[260px] h-[260px] rounded-2xl border-2 border-emerald-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.65)]"
            >
              {/* Corner guides */}
              <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-white rounded-tl" />
              <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-white rounded-tr" />
              <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-white rounded-bl" />
              <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-white rounded-br" />

              {/* Grid 3x3 subtle lines */}
              <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-20">
                <div className="border-r border-b border-white" />
                <div className="border-r border-b border-white" />
                <div className="border-b border-white" />
                <div className="border-r border-b border-white" />
                <div className="border-r border-b border-white" />
                <div className="border-b border-white" />
                <div className="border-r border-white" />
                <div className="border-r border-white" />
                <div />
              </div>

              {/* Badge */}
              <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap bg-emerald-600/90 text-white font-bold text-[10.5px] px-2.5 py-0.5 rounded-full shadow-md flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                {lang === 'es' ? 'Área de Análisis IA' : 'AI Analysis Target'}
              </div>
            </div>
          </div>

          {/* Drag instruction overlay hint */}
          <div className="pointer-events-none absolute top-2.5 left-1/2 -translate-x-1/2 bg-black/60 text-white/90 text-[10.5px] font-medium px-2.5 py-1 rounded-full backdrop-blur-xs">
            {lang === 'es' ? 'Arrastra para mover la foto' : 'Drag photo to center the detail'}
          </div>
        </div>

        {/* Zoom & Adjustment Controls */}
        <div className="px-4 py-3 bg-[var(--surface-2)] flex items-center justify-between gap-3 border-t border-[var(--line)]">
          <div className="flex items-center gap-2 flex-1">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(1, +(z - 0.25).toFixed(2)))}
              className="p-1.5 rounded-lg bg-[var(--surface)] text-[var(--ink)] border border-[var(--line)] hover:bg-[var(--line)] transition-all"
              aria-label="Zoom out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <input
              type="range"
              min="1"
              max="3"
              step="0.05"
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="w-full accent-[var(--palm)] cursor-pointer"
              aria-label="Zoom slider"
            />
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))}
              className="p-1.5 rounded-lg bg-[var(--surface)] text-[var(--ink)] border border-[var(--line)] hover:bg-[var(--line)] transition-all"
              aria-label="Zoom in"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1 text-[11px] font-bold text-[var(--ink-soft)] hover:text-[var(--ink)] px-2.5 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--line)] transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            {lang === 'es' ? 'Reiniciar' : 'Reset'}
          </button>
        </div>

        {/* Action Buttons */}
        <div className="p-4 flex flex-col sm:flex-row gap-2.5 bg-[var(--surface)]">
          <button
            type="button"
            onClick={() => handlePerformCrop(false)}
            disabled={isProcessing}
            className="flex-1 flex items-center justify-center gap-2 bg-[var(--palm)] hover:bg-[var(--palm)]/90 text-white font-extrabold text-[13.5px] py-3 px-4 rounded-2xl shadow-md active:scale-98 transition-all disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4 text-emerald-200" />
            {isProcessing
              ? lang === 'es'
                ? 'Preparando...'
                : 'Processing...'
              : lang === 'es'
              ? 'Recortar e Identificar'
              : 'Crop & Identify Specimen'}
          </button>

          <button
            type="button"
            onClick={() => handlePerformCrop(true)}
            disabled={isProcessing}
            className="flex items-center justify-center gap-1.5 bg-[var(--surface-2)] hover:bg-[var(--line)] text-[var(--ink)] font-bold text-[12.5px] py-2.5 px-3.5 rounded-2xl border border-[var(--line)] transition-colors disabled:opacity-50"
          >
            {lang === 'es' ? 'Usar Foto Completa' : 'Use Full Photo'}
          </button>
        </div>
      </div>
    </div>
  );
};
