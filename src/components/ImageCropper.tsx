"use client";

import { useState, useCallback } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { X, ZoomIn, ZoomOut, RotateCw } from "lucide-react";
import Button from "@/components/ui/Button";

interface ImageCropperProps {
  open: boolean;
  imageSrc: string;
  onClose: () => void;
  onConfirm: (croppedBlob: Blob) => void | Promise<void>;
  aspectRatio?: number;
  title?: string;
}

async function getCroppedImg(imageSrc: string, pixelCrop: Area, rotation = 0): Promise<Blob> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = imageSrc;
  });

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");

  const radians = (rotation * Math.PI) / 180;
  const sin = Math.abs(Math.sin(radians));
  const cos = Math.abs(Math.cos(radians));
  const rotatedW = image.width * cos + image.height * sin;
  const rotatedH = image.width * sin + image.height * cos;

  canvas.width = rotatedW;
  canvas.height = rotatedH;
  ctx.translate(rotatedW / 2, rotatedH / 2);
  ctx.rotate(radians);
  ctx.drawImage(image, -image.width / 2, -image.height / 2);

  const data = ctx.getImageData(pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height);

  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  ctx.putImageData(data, 0, 0);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Failed to create image blob"));
    }, "image/png", 0.92);
  });
}

export default function ImageCropper({
  open,
  imageSrc,
  onClose,
  onConfirm,
  aspectRatio = 16 / 9,
  title = "Crop image",
}: ImageCropperProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);
  const onCropComplete = useCallback((_area: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  async function handleConfirm() {
    if (!croppedAreaPixels) return;
    setProcessing(true);
    try {
      const blob = await getCroppedImg(imageSrc, croppedAreaPixels, rotation);
      await onConfirm(blob);
    } catch (e) {
      console.error("[cropper] confirm failed", e);
    } finally {
      setProcessing(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
          <button
            onClick={onClose}
            disabled={processing}
            className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="relative bg-slate-900 h-[400px]">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={aspectRatio}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onRotationChange={setRotation}
            onCropComplete={onCropComplete}
            showGrid
            objectFit="contain"
            restrictPosition
          />
        </div>

        <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-700 space-y-3">
          <div className="flex items-center gap-3">
            <ZoomOut size={14} className="text-slate-400 shrink-0" />
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 accent-indigo-600"
            />
            <ZoomIn size={14} className="text-slate-400 shrink-0" />
            <button
              type="button"
              onClick={() => setRotation((r) => (r + 90) % 360)}
              disabled={processing}
              className="ml-2 p-1.5 rounded text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Rotate 90°"
            >
              <RotateCw size={14} />
            </button>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={processing}>Cancel</Button>
            <Button onClick={handleConfirm} disabled={processing || !croppedAreaPixels}>
              {processing ? "Saving..." : "Apply"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
