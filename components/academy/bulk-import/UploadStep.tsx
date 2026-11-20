'use client';

import type { ChangeEvent, Ref } from 'react';
import { useTranslations } from 'next-intl';
import type { FileErrorState } from './types';

export interface UploadStepProps {
  fileName: string;
  fileError: FileErrorState | null;
  disabled?: boolean;
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  inputRef?: Ref<HTMLInputElement>;
}

export default function UploadStep({
  fileName,
  fileError,
  disabled,
  onFileChange,
  inputRef,
}: UploadStepProps) {
  const t = useTranslations('academy.bulkImport');

  return (
    <section className="bg-brand-card border border-gray-800 rounded-xl p-6 space-y-4">
      <div>
        <label
          htmlFor="bulk-import-file"
          className="block text-sm font-medium text-gray-300"
        >
          {t('fileLabel')}
        </label>
        <p id="bulk-import-hint" className="text-xs text-gray-400 mt-1">
          {t('fileHint')}
        </p>
      </div>
      <input
        ref={inputRef}
        id="bulk-import-file"
        type="file"
        accept=".csv,.json,text/csv,application/json"
        onChange={onFileChange}
        disabled={disabled}
        aria-describedby={
          [fileError ? 'bulk-import-file-error' : null, 'bulk-import-hint']
            .filter(Boolean)
            .join(' ') || undefined
        }
        aria-invalid={fileError ? true : undefined}
        className="w-full bg-gray-900 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-brand-green transition file:mr-4 file:py-1 file:px-4 file:rounded-lg file:border-0 file:bg-brand-green file:text-black file:font-medium hover:file:opacity-90 disabled:opacity-50"
      />
      {fileError && (
        <p
          id="bulk-import-file-error"
          role="alert"
          className="text-sm text-red-500"
        >
          {t(`fileErrors.${fileError.code}`, fileError.params)}
        </p>
      )}
      {fileName && !fileError && (
        <p className="text-sm text-gray-400">{t('loaded', { fileName })}</p>
      )}
    </section>
  );
}
