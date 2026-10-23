import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { AFRICAN_REGIONS } from '@/lib/regions';
import { FOOTBALL_POSITIONS } from '@/lib/positions';
import type { WizardData } from '../wizardState';

type FieldChange = React.ChangeEvent<
  HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
>;
type FieldBlur = React.FocusEvent<
  HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
>;

export interface PersonalInfoStepProps {
  data: WizardData;
  errors: Record<string, string>;
  validationAttempted: boolean;
  isValid: boolean;
  headingRef: React.Ref<HTMLHeadingElement>;
  nameRef: React.Ref<HTMLInputElement>;
  ageRef: React.Ref<HTMLInputElement>;
  nationalityRef: React.Ref<HTMLInputElement>;
  regionRef: React.Ref<HTMLSelectElement>;
  positionRef: React.Ref<HTMLSelectElement>;
  onChange: (e: FieldChange) => void;
  onBlur: (e: FieldBlur) => void;
  onNext: () => void;
}

export default function PersonalInfoStep({
  data,
  errors,
  validationAttempted,
  isValid,
  headingRef,
  nameRef,
  ageRef,
  nationalityRef,
  regionRef,
  positionRef,
  onChange,
  onBlur,
  onNext,
}: PersonalInfoStepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-lg font-semibold text-white outline-none"
        >
          Personal Information
        </h2>
        <p className="text-sm text-gray-400 mt-1">
          Basic details used to create your on-chain profile.
        </p>
      </div>

      {validationAttempted && Object.keys(errors).length > 0 && (
        <div
          role="alert"
          aria-live="assertive"
          aria-label="Form validation summary"
          className="rounded-md border border-red-500 bg-red-950/30 p-3"
        >
          <p className="text-sm text-red-400 font-medium">
            Please correct the {Object.keys(errors).length} error
            {Object.keys(errors).length !== 1 ? 's' : ''} below before
            continuing.
          </p>
        </div>
      )}

      <Input
        ref={nameRef}
        id="wizard-name"
        label="Name *"
        type="text"
        name="name"
        value={data.name}
        onChange={onChange}
        onBlur={onBlur}
        error={errors.name}
        placeholder="Enter your full name"
        autoComplete="name"
      />

      <Input
        ref={ageRef}
        id="wizard-age"
        label="Age *"
        type="number"
        name="age"
        value={data.age}
        onChange={onChange}
        onBlur={onBlur}
        error={errors.age}
        placeholder="Enter your age (14–45)"
        min="14"
        max="45"
        autoComplete="off"
      />

      <Input
        ref={nationalityRef}
        id="wizard-nationality"
        label="Nationality *"
        type="text"
        name="nationality"
        value={data.nationality}
        onChange={onChange}
        onBlur={onBlur}
        error={errors.nationality}
        placeholder="Enter your nationality"
        autoComplete="country-name"
      />

      <Select
        ref={regionRef}
        id="wizard-region"
        label="Region *"
        name="region"
        value={data.region}
        onChange={onChange}
        onBlur={onBlur}
        error={errors.region}
        autoComplete="address-level1"
      >
        <option value="">Select region</option>
        {AFRICAN_REGIONS.map(({ label, value }) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </Select>

      <Select
        ref={positionRef}
        id="wizard-position"
        label="Position *"
        name="position"
        value={data.position}
        onChange={onChange}
        onBlur={onBlur}
        error={errors.position}
        autoComplete="off"
      >
        <option value="">Select position</option>
        {FOOTBALL_POSITIONS.map((pos) => (
          <option key={pos.value} value={pos.value}>
            {pos.label}
          </option>
        ))}
      </Select>

      <div className="space-y-1">
        <label
          htmlFor="wizard-bio"
          className="block text-sm font-medium text-gray-300"
        >
          Bio
        </label>
        <textarea
          id="wizard-bio"
          name="bio"
          value={data.bio}
          onChange={onChange}
          className="input resize-none"
          rows={3}
          placeholder="Tell us about yourself (optional)"
          autoComplete="off"
        />
      </div>

      <Button
        type="button"
        onClick={onNext}
        className="w-full"
        disabled={validationAttempted && !isValid}
      >
        Continue
      </Button>
    </div>
  );
}
