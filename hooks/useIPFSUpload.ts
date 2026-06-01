'use client';
import { useState, useCallback } from 'react';

const MAX_SIZE = 100 * 1024 * 1024; // 100 MB
const ALLOWED_TYPES = /^(video|image)\//;

export function useIPFSUpload() {
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback((file: File): Promise<string> => {
    setProgress(0);
    setError(null);

    if (!ALLOWED_TYPES.test(file.type)) {
      const msg = 'Invalid file type. Only video and image files are allowed.';
      setError(msg);
      return Promise.reject(new Error(msg));
    }
    if (file.size > MAX_SIZE) {
      const msg = 'File exceeds the 100 MB size limit.';
      setError(msg);
      return Promise.reject(new Error(msg));
    }

    setUploading(true);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const form = new FormData();
      form.append('file', file);

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable)
          setProgress(Math.round((e.loaded / e.total) * 100));
      });

      xhr.addEventListener('load', () => {
        setUploading(false);
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const { cid } = JSON.parse(xhr.responseText);
            setProgress(100);
            resolve(cid as string);
          } catch {
            const msg = 'Unexpected response from upload server.';
            setError(msg);
            reject(new Error(msg));
          }
        } else {
          const msg = `Upload failed with status ${xhr.status}.`;
          setError(msg);
          reject(new Error(msg));
        }
      });

      xhr.addEventListener('error', () => {
        setUploading(false);
        const msg = 'Network error during upload.';
        setError(msg);
        reject(new Error(msg));
      });

      xhr.open('POST', '/api/ipfs/upload');
      xhr.send(form);
    });
  }, []);

  return { upload, progress, uploading, error };
}
