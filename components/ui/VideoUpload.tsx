"use client";

import { useState, ChangeEvent } from "react";
import { uploadToIPFS } from "@/lib/ipfs";

interface VideoUploadProps {
  onUpload: (cid: string) => void;
  error?: string;
}

export default function VideoUpload({ onUpload, error }: VideoUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [fileName, setFileName] = useState<string>("");

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type.startsWith("video/")) {
      setIsUploading(true);
      setFileName(file.name);

      try {
        const cid = await uploadToIPFS(file);
        onUpload(cid);
      } catch (err) {
        console.error("Upload failed:", err);
      } finally {
        setIsUploading(false);
      }
    }
  };

  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-300">
        Highlight Reel
      </label>
      <div className="relative">
        <input
          type="file"
          accept="video/*"
          onChange={handleFileChange}
          disabled={isUploading}
          className={`w-full bg-gray-900 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-brand-green transition file:mr-4 file:py-1 file:px-4 file:rounded-lg file:border-0 file:bg-brand-green file:text-black file:font-medium hover:file:opacity-90 disabled:opacity-50 ${
            error ? "border-red-500" : ""
          }`}
        />
        {isUploading && (
          <div className="absolute inset-0 bg-gray-900/80 flex items-center justify-center rounded-lg">
            <div className="flex items-center gap-2 text-brand-green">
              <svg
                className="animate-spin h-5 w-5"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              <span className="text-sm">Uploading...</span>
            </div>
          </div>
        )}
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      {fileName && !isUploading && (
        <p className="text-sm text-gray-400">Uploaded: {fileName}</p>
      )}
    </div>
  );
}
