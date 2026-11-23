import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import Input from '@/components/ui/Input';

describe('Input', () => {
  it('renders the label associated with the input via htmlFor/id', () => {
    render(<Input id="test-field" label="Full Name" />);

    const label = screen.getByText('Full Name');
    const input = screen.getByRole('textbox');

    expect(label).toHaveAttribute('for', 'test-field');
    expect(input).toHaveAttribute('id', 'test-field');
  });

  it('renders hint text and links it via aria-describedby', () => {
    render(<Input id="test-field" label="Username" hint="Must be unique" />);

    const hint = screen.getByText('Must be unique');
    expect(hint).toHaveAttribute('id', 'test-field-hint');

    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('aria-describedby', 'test-field-hint');
  });

  it('renders an accessible error message and links it via aria-describedby', () => {
    render(<Input id="test-field" label="Email" error="Invalid email" />);

    const error = screen.getByRole('alert');
    expect(error).toHaveTextContent('Invalid email');
    expect(error).toHaveAttribute('id', 'test-field-error');

    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('aria-describedby', 'test-field-error');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('links both hint and error via aria-describedby when both are provided', () => {
    render(
      <Input
        id="test-field"
        label="Password"
        hint="At least 8 characters"
        error="Too short"
      />,
    );

    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute(
      'aria-describedby',
      'test-field-hint test-field-error',
    );
  });

  it('applies border-red-500 class when error is present', () => {
    render(<Input id="test-field" label="Name" error="Required" />);

    const input = screen.getByRole('textbox');
    expect(input).toHaveClass('input');
    expect(input).toHaveClass('border-red-500');
  });

  it('does not apply border-red-500 when there is no error', () => {
    render(<Input id="test-field" label="Name" />);

    const input = screen.getByRole('textbox');
    expect(input).toHaveClass('input');
    expect(input).not.toHaveClass('border-red-500');
  });

  it('does not render hint or error elements when neither is provided', () => {
    render(<Input id="test-field" label="Name" />);

    expect(screen.queryByRole('alert')).toBeNull();
    const input = screen.getByRole('textbox');
    expect(input).not.toHaveAttribute('aria-describedby');
  });

  it('forwards the ref to the underlying input element', () => {
    const ref = createRef<HTMLInputElement>();
    render(<Input id="test-field" label="Name" ref={ref} />);

    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName).toBe('INPUT');
  });

  it('passes through standard HTML input props', () => {
    render(
      <Input
        id="test-field"
        label="Age"
        type="number"
        min="0"
        max="100"
        placeholder="Enter age"
      />,
    );

    const input = screen.getByRole('spinbutton');
    expect(input).toHaveAttribute('type', 'number');
    expect(input).toHaveAttribute('min', '0');
    expect(input).toHaveAttribute('max', '100');
    expect(input).toHaveAttribute('placeholder', 'Enter age');
  });
});
