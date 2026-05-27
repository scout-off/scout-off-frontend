"use client";
import { useState, useCallback } from "react";
import { uploadToIPFS } from "@/lib/ipfs";

export function useIPFSUpload() {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(async (file: File) => {
    setUploading(true);
    setProgress(0);
    setError(null);

    try {
      // Simulate progress for better UX (since axios doesn't support upload progress with FormData easily)
      const progressInterval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 200);

      const cid = await uploadToIPFS(file);

      clearInterval(progressInterval);
      setProgress(100);

      return cid;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Upload failed";
      setError(errorMessage);
      throw err;
    } finally {
      setUploading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setUploading(false);
    setProgress(0);
    setError(null);
  }, []);

  return { upload, uploading, progress, error, reset };
}
