"use client";

import { useState, useRef, useCallback } from "react";
import Image from "next/image";
import { Camera, Trash2, Loader2, ImageIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"];

interface CoverPhotoUploadProps {
  bucket: "org-covers" | "team-covers";
  ownerId: string;
  currentUrl: string | null;
  fallbackText: string;
  shape?: "square" | "wide";
  onChange: (url: string | null) => Promise<void> | void;
  canEdit: boolean;
}

export default function CoverPhotoUpload({
  bucket,
  ownerId,
  currentUrl,
  fallbackText,
  shape = "square",
  onChange,
  canEdit,
}: CoverPhotoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  const dims = shape === "wide"
    ? { w: 320, h: 96, classes: "w-full h-24 rounded-xl" }
    : { w: 96, h: 96, classes: "h-24 w-24 rounded-2xl" };

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      if (file.size > MAX_BYTES) {
        setError("Image must be under 2MB.");
        return;
      }
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setError("File must be PNG, JPEG, WebP, GIF, or SVG.");
        return;
      }

      setUploading(true);
      const ext = file.name.split(".").pop() || "png";
      const filePath = `${ownerId}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filePath, file, { upsert: true, contentType: file.type });

      if (uploadError) {
        setError("Upload failed: " + uploadError.message);
        setUploading(false);
        return;
      }

      const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(filePath);
      await onChange(publicUrl);
      setUploading(false);
    },
    [bucket, ownerId, onChange, supabase],
  );

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    e.target.value = "";
  }

  async function handleRemove() {
    if (!currentUrl) return;
    setError(null);
    setRemoving(true);
    try {
      // Delete from storage if it's our bucket
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

  return (
    <div className="flex items-start gap-4">
      <div className={cn("relative shrink-0", dims.classes, "overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700")}>
        {currentUrl ? (
          <Image
            src={currentUrl}
            alt={fallbackText}
            width={dims.w}
            height={dims.h}
            className={cn("h-full w-full", shape === "wide" ? "object-cover" : "object-contain p-1")}
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-400 dark:text-slate-500 text-xs font-semibold">
            {shape === "wide" ? (
              <ImageIcon size={20} />
            ) : (
              <span className="text-center text-lg">{fallbackText.slice(0, 2).toUpperCase()}</span>
            )}
          </div>
        )}
        {canEdit && (
          <button
            type="button"
            disabled={uploading || removing}
            onClick={() => inputRef.current?.click()}
            className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/40 text-white opacity-0 hover:opacity-100 transition-opacity disabled:cursor-not-allowed"
            aria-label="Change cover photo"
          >
            {uploading ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
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
          {shape === "wide" ? "Cover photo" : "Logo"}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          PNG, JPEG, WebP, GIF, or SVG. Max 2MB.
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
  );
}
