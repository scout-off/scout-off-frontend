'use client';

import { useState, ChangeEvent } from 'react';
import { uploadToIPFS } from '@/lib/ipfs';

/** Accepted MIME types for client-side validation */
export const ACCEPTED_MIME_TYPES = [
  'video/mp4',
  'video/quicktime',
  'image/jpeg',
  'image/png',
] as const;

/** Accepted file extensions label shown to users */
export const ACCEPTED_TYPES_LABEL = 'MP4, MOV, JPEG, PNG';

/** Maximum file size enforced on the client: 50 MB */
export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
export const MAX_FILE_SIZE_LABEL = '50 MB';

/**
 * Validate a File against accepted types and size limit.
 * Returns an error string, or null when the file is valid.
 */
export function validateFile(file: File): string | null {
  if (!(ACCEPTED_MIME_TYPES as readonly string[]).includes(file.type)) {
    return `File type "${file.type || 'unknown'}" is not supported. Please upload ${ACCEPTED_TYPES_LABEL}.`;
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeMB = (file.size / 1024 / 1024).toFixed(1);
    return `File is too large (${sizeMB} MB). Maximum size is ${MAX_FILE_SIZE_LABEL}.`;
  }
  return null;
}

interface VideoUploadProps {
  onUpload: (cid: string) => void;
  /** Propagate a validation or upload error from outside (e.g. parent state) */
  error?: string;
  /** Called whenever client-side file validation produces an error (or null to clear) */
  onValidationError?: (error: string | null) => void;
}

export default function VideoUpload({
  onUpload,
  error,
  onValidationError,
}: VideoUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [fileName, setFileName] = useState<string>('');
  const [localError, setLocalError] = useState<string | null>(null);

  const displayError = error ?? localError;
  const errorId = displayError ? 'video-upload-error' : undefined;

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // ── Client-side validation ────────────────────────────────────────────────
    const validationError = validateFile(file);
    if (validationError) {
      setLocalError(validationError);
      onValidationError?.(validationError);
      // Reset so the user can pick again
      e.target.value = '';
      return;
    }

    // Clear any previous error
    setLocalError(null);
    onValidationError?.(null);

    setIsUploading(true);
    setFileName(file.name);

    try {
      const cid = await uploadToIPFS(file);
      onUpload(cid);
    } catch (err) {
      console.error('Upload failed:', err);
      const uploadErr = 'Upload failed. Please try again.';
      setLocalError(uploadErr);
      onValidationError?.(uploadErr);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-1">
      <label
        htmlFor="video-upload-input"
        className="block text-sm font-medium text-gray-300"
      >
        Highlight Reel
      </label>
      <p id="video-upload-hint" className="text-xs text-gray-500">
        Accepted: {ACCEPTED_TYPES_LABEL} · Max {MAX_FILE_SIZE_LABEL}
      </p>
      <div className="relative">
        <input
          id="video-upload-input"
          type="file"
          accept={ACCEPTED_MIME_TYPES.join(',')}
          onChange={handleFileChange}
          disabled={isUploading}
          aria-describedby={
            [errorId, 'video-upload-hint'].filter(Boolean).join(' ') ||
            undefined
          }
          aria-invalid={displayError ? true : undefined}
          className={`w-full bg-gray-900 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-brand-green transition file:mr-4 file:py-1 file:px-4 file:rounded-lg file:border-0 file:bg-brand-green file:text-black file:font-medium hover:file:opacity-90 disabled:opacity-50 ${
            displayError ? 'border-red-500' : ''
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
      {displayError && (
        <p id={errorId} role="alert" className="text-sm text-red-500">
          {displayError}
        </p>
      )}
      {fileName && !isUploading && !displayError && (
        <p className="text-sm text-gray-400">Uploaded: {fileName}</p>
      )}
    </div>
  );
}
