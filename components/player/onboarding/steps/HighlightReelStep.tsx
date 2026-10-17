import Button from '@/components/ui/Button';
import VideoUpload from '@/components/ui/VideoUpload';
import { formatShortCid } from '../wizardState';

export interface HighlightReelStepProps {
  ipfsHash: string;
  error: string | undefined;
  validationAttempted: boolean;
  isUploadInProgress: boolean;
  headingRef: React.Ref<HTMLHeadingElement>;
  summaryRef: React.Ref<HTMLDivElement>;
  onUpload: (cid: string) => void;
  onUploadStart: () => void;
  onUploadingChange: (uploading: boolean) => void;
  onBack: () => void;
  onNext: () => void;
}

export default function HighlightReelStep({
  ipfsHash,
  error,
  validationAttempted,
  isUploadInProgress,
  headingRef,
  summaryRef,
  onUpload,
  onUploadStart,
  onUploadingChange,
  onBack,
  onNext,
}: HighlightReelStepProps) {
  const shortCid = formatShortCid(ipfsHash);
  return (
    <div className="space-y-6">
      <div>
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-lg font-semibold text-white outline-none"
        >
          Highlight Reel
        </h2>
        <p className="text-sm text-gray-400 mt-1">
          Upload a video showcasing your skills. The upload must complete
          before you can continue.
        </p>
      </div>

      {validationAttempted && error && (
        <div
          ref={summaryRef}
          role="alert"
          aria-live="assertive"
          aria-label="Form validation summary"
          tabIndex={-1}
          className="rounded-md border border-red-500 bg-red-950/30 p-3 outline-none"
        >
          <p className="text-sm text-red-400 font-medium">
            Please correct the error below before continuing.
          </p>
        </div>
      )}

      {ipfsHash && (
        <div className="rounded-md border border-brand-green/40 bg-brand-green/10 p-3 text-sm text-brand-green">
          ✓ Highlight reel already uploaded ({shortCid}). Uploading a new file
          below will replace it.
        </div>
      )}

      <VideoUpload
        onUpload={onUpload}
        onUploadStart={onUploadStart}
        onUploadingChange={onUploadingChange}
        error={error}
      />

      <div className="flex gap-3">
        <Button
          type="button"
          variant="secondary"
          onClick={onBack}
          className="flex-1"
        >
          Back
        </Button>
        <Button
          type="button"
          onClick={onNext}
          disabled={isUploadInProgress}
          title={
            isUploadInProgress
              ? 'Please wait for the highlight reel upload to finish'
              : undefined
          }
          className="flex-1"
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
