"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, X, CheckCircle, AlertCircle, Image as ImageIcon, Loader2 } from "lucide-react";

export type UploadItem = {
  file: File;
  id: string;
  preview: string;
  status: "pending" | "uploading" | "done" | "error";
  progress: number;
  error?: string;
};

type BulkUploaderProps = {
  onUpload: (file: File) => Promise<void>;
  accept?: string;
  maxFiles?: number;
  maxSizeMB?: number;
  label?: string;
  hint?: string;
};

export function BulkUploader({
  onUpload,
  accept = "image/*",
  maxFiles = 50,
  maxSizeMB = 10,
  label = "Kéo thả ảnh vào đây",
  hint,
}: BulkUploaderProps) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const newItems: UploadItem[] = [];
      const arr = Array.from(files);

      for (const file of arr) {
        if (items.length + newItems.length >= maxFiles) break;
        if (!file.type.startsWith("image/")) continue;
        if (file.size > maxSizeMB * 1024 * 1024) continue;

        newItems.push({
          file,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          preview: URL.createObjectURL(file),
          status: "pending",
          progress: 0,
        });
      }

      setItems((prev) => [...prev, ...newItems]);
    },
    [items.length, maxFiles, maxSizeMB]
  );

  const removeItem = (id: string) => {
    setItems((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item) URL.revokeObjectURL(item.preview);
      return prev.filter((i) => i.id !== id);
    });
  };

  const clearAll = () => {
    items.forEach((i) => URL.revokeObjectURL(i.preview));
    setItems([]);
  };

  const uploadAll = async () => {
    if (isUploading) return;
    setIsUploading(true);

    const pending = items.filter((i) => i.status === "pending" || i.status === "error");
    const CONCURRENCY = 3;

    const uploadOne = async (item: UploadItem) => {
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status: "uploading" as const, progress: 30 } : i))
      );

      try {
        await onUpload(item.file);
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, status: "done" as const, progress: 100 } : i))
        );
      } catch (err) {
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? { ...i, status: "error" as const, progress: 0, error: err instanceof Error ? err.message : "Lỗi upload" }
              : i
          )
        );
      }
    };

    // Upload in batches of CONCURRENCY
    for (let i = 0; i < pending.length; i += CONCURRENCY) {
      const batch = pending.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(uploadOne));
    }

    setIsUploading(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };

  const doneCount = items.filter((i) => i.status === "done").length;
  const errorCount = items.filter((i) => i.status === "error").length;
  const pendingCount = items.filter((i) => i.status === "pending" || i.status === "uploading").length;

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer
          transition-all duration-200
          ${isDragging ? "border-violet-500 bg-violet-500/5 scale-[1.01]" : "th-border hover:border-violet-400 hover:bg-violet-500/3"}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple
          className="hidden"
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />
        <Upload size={32} className="mx-auto mb-3 th-text-muted" />
        <p className="font-semibold th-text-primary text-sm">{label}</p>
        <p className="text-xs th-text-muted mt-1">
          {hint || `Hoặc bấm để chọn file. Tối đa ${maxFiles} ảnh, mỗi ảnh ≤ ${maxSizeMB}MB`}
        </p>
      </div>

      {/* File list */}
      {items.length > 0 && (
        <>
          {/* Stats bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-xs">
              <span className="th-text-secondary font-medium">{items.length} ảnh</span>
              {doneCount > 0 && (
                <span className="flex items-center gap-1 th-text-success">
                  <CheckCircle size={12} /> {doneCount} xong
                </span>
              )}
              {errorCount > 0 && (
                <span className="flex items-center gap-1 th-text-danger">
                  <AlertCircle size={12} /> {errorCount} lỗi
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={clearAll} className="text-xs th-text-muted hover:th-text-danger transition-colors px-2 py-1">
                Xoá tất cả
              </button>
              <button
                onClick={uploadAll}
                disabled={isUploading || pendingCount === 0}
                className="px-4 py-1.5 text-xs font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-lg hover:from-violet-700 hover:to-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {isUploading ? (
                  <>
                    <Loader2 size={12} className="animate-spin" /> Đang tải...
                  </>
                ) : (
                  <>
                    <Upload size={12} /> Tải lên tất cả ({pendingCount})
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Progress bar */}
          {items.length > 0 && (
            <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-tertiary)" }}>
              <div
                className="h-full rounded-full transition-all duration-300 bg-gradient-to-r from-violet-500 to-indigo-500"
                style={{ width: `${items.length > 0 ? (doneCount / items.length) * 100 : 0}%` }}
              />
            </div>
          )}

          {/* Thumbnail grid */}
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2 max-h-[300px] overflow-y-auto p-1">
            {items.map((item) => (
              <div
                key={item.id}
                className="relative group aspect-square rounded-lg overflow-hidden border"
                style={{ borderColor: item.status === "error" ? "var(--danger)" : item.status === "done" ? "var(--success)" : "var(--border-primary)" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.preview} alt={item.file.name} className="w-full h-full object-cover" />

                {/* Status overlay */}
                {item.status === "uploading" && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <Loader2 size={16} className="text-white animate-spin" />
                  </div>
                )}
                {item.status === "done" && (
                  <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center">
                    <CheckCircle size={16} className="text-green-400" />
                  </div>
                )}
                {item.status === "error" && (
                  <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center">
                    <AlertCircle size={16} className="text-red-400" />
                  </div>
                )}

                {/* Remove button */}
                {item.status !== "uploading" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeItem(item.id);
                    }}
                    className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X size={10} />
                  </button>
                )}

                {/* File name tooltip */}
                <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[8px] px-1 py-0.5 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                  {item.file.name}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
