import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { axe, toHaveNoViolations } from 'jest-axe';
import StepIndicator from '@/components/player/onboarding/StepIndicator';
import { STEPS } from '@/components/player/onboarding/wizardState';

expect.extend(toHaveNoViolations);

describe('StepIndicator', () => {
  it('renders every step label', () => {
    render(<StepIndicator currentStep={1} />);
    STEPS.forEach((step) => {
      expect(screen.getByText(step.label)).toBeInTheDocument();
    });
  });

  it('marks only the current step with aria-current="step"', () => {
    const { container } = render(<StepIndicator currentStep={2} />);
    const current = container.querySelectorAll('[aria-current]');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute('aria-current', 'step');
    expect(current[0]).toHaveAttribute(
      'aria-label',
      `Step 2 of ${STEPS.length}: ${STEPS[1].label}`,
    );
  });

  it('distinguishes completed steps', () => {
    render(<StepIndicator currentStep={3} />);
    expect(
      screen.getByLabelText(
        `Step 1 of ${STEPS.length}: ${STEPS[0].label} (completed)`,
      ),
    ).toHaveTextContent('✓');
    expect(
      screen.getByLabelText(`Step 3 of ${STEPS.length}: ${STEPS[2].label}`),
    ).toHaveTextContent('3');
  });

  it.each([0, -1, 99])('does not crash for out-of-range step %i', (step) => {
    const { container } = render(<StepIndicator currentStep={step} />);
    expect(
      screen.getByRole('navigation', { name: 'Registration progress' }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll('[aria-current]')).toHaveLength(0);
  });

  it('has no axe violations', async () => {
    const { container } = render(<StepIndicator currentStep={2} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
