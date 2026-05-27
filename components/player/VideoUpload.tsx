"use client";
import { useState, useRef, useCallback } from "react";
import { useIPFSUpload } from "@/hooks/useIPFSUpload";

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
const ACCEPTED_TYPES = ["video/*", "image/*"];

interface VideoUploadProps {
  onUpload: (cid: string) => void;
}

export default function VideoUpload({ onUpload }: VideoUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { upload, uploading, progress, error, reset } = useIPFSUpload();

  const validateFile = (file: File): string | null => {
    if (file.size > MAX_FILE_SIZE) {
      return "File size exceeds 100 MB limit";
    }

    const fileType = file.type;
    const isVideo = fileType.startsWith("video/");
    const isImage = fileType.startsWith("image/");

    if (!isVideo && !isImage) {
      return "Only video and image files are allowed";
    }

    return null;
  };

  const handleFileSelect = useCallback(
    (file: File) => {
      const validationError = validateFile(file);
      if (validationError) {
        setValidationError(validationError);
        setSelectedFile(null);
        return;
      }

      setValidationError(null);
      setSelectedFile(file);
      reset();
    },
    [reset]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect]
  );

  const handleUpload = useCallback(async () => {
    if (!selectedFile) return;

    try {
      const cid = await upload(selectedFile);
      onUpload(cid);
      setSelectedFile(null);
      reset();
    } catch (err) {
      // Error is already handled by useIPFSUpload
    }
  }, [selectedFile, upload, onUpload, reset]);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
  };

  return (
    <div className="bg-brand-card border border-gray-800 rounded-xl p-6">
      <h2 className="font-semibold text-white mb-4">Upload Highlight Reel</h2>

      {!selectedFile ? (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`
            border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
            ${isDragging ? "border-brand-green bg-brand-green/10" : "border-gray-700 hover:border-gray-600"}
          `}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES.join(",")}
            onChange={handleInputChange}
            className="hidden"
          />
          <div className="text-gray-400 mb-2">
            <svg
              className="mx-auto h-12 w-12"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
          </div>
          <p className="text-white font-medium mb-1">
            {isDragging ? "Drop your file here" : "Drag and drop or click to upload"}
          </p>
          <p className="text-gray-500 text-sm">No file chosen</p>
          <p className="text-gray-600 text-xs mt-2">
            Videos and images only (max 100 MB)
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium truncate">{selectedFile.name}</p>
                <p className="text-gray-500 text-sm">{formatFileSize(selectedFile.size)}</p>
              </div>
              {!uploading && (
                <button
                  onClick={() => {
                    setSelectedFile(null);
                    setValidationError(null);
                    reset();
                  }}
                  className="ml-4 text-gray-500 hover:text-white transition-colors"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              )}
            </div>

            {uploading && (
              <div className="mt-3">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-400">Uploading...</span>
                  <span className="text-brand-green">{progress}%</span>
                </div>
                <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand-green rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {!uploading && (
            <button
              onClick={handleUpload}
              className="w-full bg-brand-green text-white font-medium py-2 px-4 rounded-lg hover:bg-brand-green/90 transition-colors"
            >
              Upload to IPFS
            </button>
          )}
        </div>
      )}

      {validationError && (
        <div className="mt-4 bg-red-900/20 border border-red-800 rounded-lg p-3">
          <p className="text-red-400 text-sm">{validationError}</p>
        </div>
      )}

      {error && (
        <div className="mt-4 bg-red-900/20 border border-red-800 rounded-lg p-3">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}
    </div>
  );
}
