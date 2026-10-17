import { STEPS } from './wizardState';

export default function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <nav aria-label="Registration progress">
      <ol className="flex items-center w-full">
        {STEPS.map((step, index) => {
          const isCompleted = currentStep > step.id;
          const isCurrent = currentStep === step.id;
          return (
            <li
              key={step.id}
              className={`flex items-center ${index < STEPS.length - 1 ? 'flex-1' : ''}`}
            >
              <div className="flex flex-col items-center flex-shrink-0">
                <div
                  aria-current={isCurrent ? 'step' : undefined}
                  aria-label={`Step ${step.id} of ${STEPS.length}: ${step.label}`}
                  className={[
                    'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold motion-safe:transition-colors',
                    isCompleted
                      ? 'bg-brand-green text-black'
                      : isCurrent
                        ? 'border-2 border-brand-green text-brand-green'
                        : 'border-2 border-gray-600 text-gray-400',
                  ].join(' ')}
                >
                  {isCompleted ? '✓' : step.id}
                </div>
                <span
                  className={`text-xs mt-1 whitespace-nowrap ${
                    isCurrent ? 'text-white font-medium' : 'text-gray-400'
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {index < STEPS.length - 1 && (
                <div
                  aria-hidden="true"
                  className={`flex-1 h-px mx-3 mb-4 motion-safe:transition-colors ${
                    isCompleted ? 'bg-brand-green' : 'bg-gray-700'
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
