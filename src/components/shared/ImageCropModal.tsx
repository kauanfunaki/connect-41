"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { getCroppedImageBlob } from "@/lib/imageCrop";

type Props = {
  file: File | null;
  shape?: "round" | "rect";
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
};

// Modal de recorte (react-easy-crop) — abre logo após o usuário escolher o
// arquivo, antes de qualquer upload. Sempre 1:1 porque os 3 lugares que usam
// este modal (foto de perfil, logo do workspace, logo da empresa) exibem o
// avatar num container quadrado de tamanho fixo (ver AvatarImage.tsx).
export function ImageCropModal({ file, shape = "round", onCancel, onConfirm }: Props) {
  const imageSrc = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  // Revoga o object URL só quando ele muda/desmonta — não mexe em estado do
  // React, então fica fora do componente que reseta enquadramento por `key`.
  useEffect(() => {
    return () => {
      if (imageSrc) URL.revokeObjectURL(imageSrc);
    };
  }, [imageSrc]);

  if (!file || !imageSrc) return null;

  // `key={imageSrc}` remonta este componente a cada arquivo novo — mais simples
  // que resetar crop/zoom/erro manualmente num efeito (e evita side-effect
  // síncrono dentro de useEffect).
  return (
    <CropperDialog
      key={imageSrc}
      imageSrc={imageSrc}
      mimeType={file.type}
      shape={shape}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}

function CropperDialog({
  imageSrc,
  mimeType,
  shape,
  onCancel,
  onConfirm,
}: {
  imageSrc: string;
  mimeType: string;
  shape: "round" | "rect";
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  async function handleConfirm() {
    if (!croppedAreaPixels) return;
    setIsProcessing(true);
    setError(null);
    try {
      const blob = await getCroppedImageBlob(imageSrc, croppedAreaPixels, mimeType);
      onConfirm(blob);
    } catch {
      setError("Erro ao recortar a imagem. Tente novamente.");
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !isProcessing) onCancel();
      }}
    >
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-5 shadow-lg">
        <h2 className="text-[15px] font-semibold text-fg mb-1.5">Ajustar imagem</h2>
        <p className="text-[13px] text-fg-secondary mb-3">Arraste para posicionar e use o zoom para enquadrar.</p>

        <div className="relative w-full h-[280px] bg-canvas rounded-md overflow-hidden">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape={shape}
            showGrid={shape === "rect"}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>

        <div className="flex items-center gap-3 mt-4">
          <span className="text-[12px] text-fg-muted">Zoom</span>
          {/* eslint-disable-next-line no-restricted-syntax -- controle nativo de range, sem primitivo de Slider no design system ainda */}
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1"
          />
        </div>

        {error && (
          <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2 mt-3">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={isProcessing}
            className="h-9 px-4 rounded-md border border-border text-[13px] text-fg-muted hover:text-fg hover:bg-surface-2 disabled:opacity-60 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isProcessing || !croppedAreaPixels}
            className="h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
          >
            {isProcessing ? "Aplicando…" : "Aplicar"}
          </button>
        </div>
      </div>
    </div>
  );
}
