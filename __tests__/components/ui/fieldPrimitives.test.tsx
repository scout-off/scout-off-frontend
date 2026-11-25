import { render, screen } from '@testing-library/react';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import { mergeDescribedBy } from '@/components/ui/fieldProps';

describe('mergeDescribedBy', () => {
  it('joins defined ids and drops empty ones', () => {
    expect(mergeDescribedBy('a', undefined, 'b', '')).toBe('a b');
  });

  it('returns undefined when nothing is defined', () => {
    expect(mergeDescribedBy(undefined, '')).toBeUndefined();
  });
});

const cases = [
  {
    name: 'Input',
    renderField: (props: Record<string, unknown>) => (
      <Input label="Field" {...props} />
    ),
    role: 'textbox',
  },
  {
    name: 'Select',
    renderField: (props: Record<string, unknown>) => (
      <Select label="Field" {...props}>
        <option value="a">A</option>
      </Select>
    ),
    role: 'combobox',
  },
  {
    name: 'Textarea',
    renderField: (props: Record<string, unknown>) => (
      <Textarea label="Field" {...props} />
    ),
    role: 'textbox',
  },
];

describe.each(cases)('$name field contract', ({ renderField, role }) => {
  it('generates an id and links the label when none is given', () => {
    render(renderField({}));
    const control = screen.getByRole(role, { name: 'Field' });
    expect(control.id).toBeTruthy();
  });

  it('merges a caller-supplied aria-describedby with hint and error ids', () => {
    render(
      renderField({
        id: 'f',
        hint: 'Hint',
        error: 'Error',
        'aria-describedby': 'external',
      }),
    );
    expect(screen.getByRole(role)).toHaveAttribute(
      'aria-describedby',
      'external f-hint f-error',
    );
  });

  it('keeps a caller-supplied aria-describedby without hint or error', () => {
    render(renderField({ id: 'f', 'aria-describedby': 'external' }));
    expect(screen.getByRole(role)).toHaveAttribute(
      'aria-describedby',
      'external',
    );
  });

  it('marks required fields with aria-required and a hidden label suffix', () => {
    render(renderField({ required: true }));
    const control = screen.getByRole(role, { name: 'Field (required)' });
    expect(control).toHaveAttribute('aria-required', 'true');
  });
});

describe('Textarea character counter', () => {
  it('shows the current length against maxLength', () => {
    render(
      <Textarea id="t" label="Note" maxLength={10} value="abc" readOnly />,
    );
    expect(screen.getByText('3/10')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveAttribute(
      'aria-describedby',
      't-counter',
    );
  });
});
