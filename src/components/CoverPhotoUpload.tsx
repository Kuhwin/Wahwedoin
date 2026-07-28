"use client";

import { useState, useRef, useCallback } from "react";
import Image from "next/image";
import { Trash2, Loader2, Crop as CropIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import ImageCropper from "@/components/ImageCropper";

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"];

interface CoverPhotoUploadProps {
  bucket: "org-covers" | "team-covers" | "avatars";
  ownerId: string;
  currentUrl: string | null;
  fallbackText: string;
  shape?: "square" | "wide" | "compact";
  aspectRatio?: number;
  onChange: (url: string | null) => Promise<void> | void;
  canEdit: boolean;
}

function buildSvgPlaceholder(letter: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="#e2e8f0"/><text x="48" y="58" text-anchor="middle" font-family="system-ui" font-size="36" font-weight="700" fill="#64748b">${letter}</text></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

export default function CoverPhotoUpload({
  bucket,
  ownerId,
  currentUrl,
  fallbackText,
  shape = "square",
  aspectRatio = 16 / 9,
  onChange,
  canEdit,
}: CoverPhotoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  const dims = shape === "wide"
    ? { w: 320, h: 96, classes: "w-full h-24 rounded-xl" }
    : shape === "compact"
      ? { w: 96, h: 60, classes: "w-24 h-[60px] rounded-lg" }
      : { w: 96, h: 96, classes: "h-24 w-24 rounded-2xl" };

  const handleSelectedFile = useCallback(
    async (blob: Blob, ext: string) => {
      setError(null);
      setUploading(true);
      const filePath = `${ownerId}/${Date.now()}.${ext}`;
      const contentType = blob.type || "image/png";

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filePath, blob, { upsert: true, contentType });

      if (uploadError) {
        console.error("[cover-photo] upload failed", uploadError);
        setError("Upload failed: " + uploadError.message);
        setUploading(false);
        return;
      }

      const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(filePath);
      try {
        await onChange(publicUrl);
      } catch (e) {
        console.error("[cover-photo] onChange failed", e);
        setError(e instanceof Error ? e.message : "Failed to save");
        setUploading(false);
        return;
      }
      setUploading(false);
    },
    [bucket, ownerId, onChange, supabase],
  );

  const handleCropConfirm = useCallback(
    async (croppedBlob: Blob) => {
      setCropSrc(null);
      const ext = croppedBlob.type === "image/jpeg" ? "jpg" : "png";
      await handleSelectedFile(croppedBlob, ext);
    },
    [handleSelectedFile],
  );

  function handleFile(file: File) {
    setError(null);
    if (file.size > MAX_BYTES) {
      setError("Image must be under 2MB.");
      return;
    }
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError("File must be PNG, JPEG, WebP, GIF, or SVG.");
      return;
    }
    // SVGs can't be cropped, upload directly
    if (file.type === "image/svg+xml") {
      void handleSelectedFile(file, "svg");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setCropSrc(reader.result as string);
    reader.readAsDataURL(file);
  }

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }

  async function handleRemove() {
    if (!currentUrl) return;
    setError(null);
    setRemoving(true);
    try {
      const marker = `/${bucket}/`;
      const idx = currentUrl.indexOf(marker);
      if (idx >= 0) {
        const path = currentUrl.substring(idx + marker.length).split("?")[0];
        await supabase.storage.from(bucket).remove([path]);
      }
      await onChange(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove cover photo.");
    } finally {
      setRemoving(false);
    }
  }

  const letter = fallbackText.charAt(0).toUpperCase() || "?";
  const placeholderUrl = !currentUrl ? buildSvgPlaceholder(letter) : null;

  return (
    <>
      <div className="flex items-start gap-4">
        <div className={cn("relative shrink-0", dims.classes, "overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700")}>
          <Image
            src={currentUrl || placeholderUrl || ""}
            alt={fallbackText}
            width={dims.w}
            height={dims.h}
            className={cn("h-full w-full", (shape === "wide" || shape === "compact") ? "object-cover" : "object-contain p-1")}
            unoptimized
          />
          {canEdit && (
            <button
              type="button"
              disabled={uploading || removing}
              onClick={() => inputRef.current?.click()}
              className="absolute inset-0 flex items-center justify-center gap-1.5 bg-black/0 hover:bg-black/40 text-white opacity-0 hover:opacity-100 transition-opacity disabled:cursor-not-allowed text-xs font-medium"
              aria-label="Change cover photo"
            >
              {uploading ? <Loader2 size={18} className="animate-spin" /> : (
                <>
                  <CropIcon size={16} />
                  <span>Crop &amp; upload</span>
                </>
              )}
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_TYPES.join(",")}
            onChange={handleInput}
            className="hidden"
          />
        </div>

        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
            {shape === "wide" ? "Cover photo" : shape === "compact" ? "Cover" : "Logo"}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            PNG, JPEG, WebP, GIF, or SVG. Max 2MB. Crop before uploading.
          </p>
          {canEdit && currentUrl && (
            <button
              type="button"
              onClick={() => void handleRemove()}
              disabled={removing || uploading}
              className="mt-1 inline-flex items-center gap-1.5 self-start text-xs text-red-600 dark:text-red-400 hover:text-red-700 disabled:opacity-50"
            >
              {removing ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              Remove
            </button>
          )}
          {error && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>
      </div>

      {cropSrc && (
        <ImageCropper
          open={!!cropSrc}
          imageSrc={cropSrc}
          aspectRatio={aspectRatio}
          onClose={() => setCropSrc(null)}
          onConfirm={handleCropConfirm}
          title="Crop your image"
        />
      )}
    </>
  );
}
