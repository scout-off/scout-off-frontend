import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Button from '@/components/ui/Button';

describe('Button variants', () => {
  it('renders primary variant classes by default', () => {
    render(<Button>Click</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toMatch(/bg-brand-green/);
    expect(btn.className).toMatch(/text-black/);
  });

  it('renders secondary variant classes', () => {
    render(<Button variant="secondary">Click</Button>);
    expect(screen.getByRole('button').className).toMatch(/bg-gray-700/);
  });

  it('renders danger variant classes', () => {
    render(<Button variant="danger">Click</Button>);
    expect(screen.getByRole('button').className).toMatch(/bg-red-600/);
  });

  it('renders ghost variant classes', () => {
    render(<Button variant="ghost">Click</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toMatch(/bg-transparent/);
    expect(btn.className).toMatch(/border/);
  });
});

describe('Button loading state', () => {
  it('renders Spinner and hides children when loading=true', () => {
    render(<Button loading>Save</Button>);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('Save')).not.toBeInTheDocument();
  });

  it('sets aria-busy="true" when loading', () => {
    render(<Button loading>Save</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
  });

  it('sets aria-busy to undefined (absent) when not loading', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-busy');
  });

  it('prevents click when loading', () => {
    const onClick = jest.fn();
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('is natively disabled when loading', () => {
    render(<Button loading>Save</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});

describe('Button disabled state', () => {
  it('applies opacity-50 and cursor-not-allowed when disabled', () => {
    render(<Button disabled>Click</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toMatch(/opacity-50/);
    expect(btn.className).toMatch(/cursor-not-allowed/);
  });

  it('is natively disabled', () => {
    render(<Button disabled>Click</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('prevents click when disabled', () => {
    const onClick = jest.fn();
    render(
      <Button disabled onClick={onClick}>
        Click
      </Button>,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('sets aria-disabled when disabled', () => {
    render(<Button disabled>Click</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('aria-disabled', 'true');
  });
});

describe('Button fullWidth', () => {
  it('applies w-full when fullWidth=true', () => {
    render(<Button fullWidth>Click</Button>);
    expect(screen.getByRole('button').className).toMatch(/w-full/);
  });

  it('does not apply w-full by default', () => {
    render(<Button>Click</Button>);
    expect(screen.getByRole('button').className).not.toMatch(/w-full/);
  });
});

describe('Button rest props forwarding', () => {
  it('forwards type, name, and data-testid', () => {
    render(
      <Button type="submit" name="submit-btn" data-testid="my-btn">
        Go
      </Button>,
    );
    const btn = screen.getByTestId('my-btn');
    expect(btn).toHaveAttribute('type', 'submit');
    expect(btn).toHaveAttribute('name', 'submit-btn');
  });

  it('merges className with variant classes', () => {
    render(<Button className="mt-4">Click</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toMatch(/mt-4/);
    expect(btn.className).toMatch(/bg-brand-green/);
  });

  it('fires onClick when enabled', () => {
    const onClick = jest.fn();
    render(<Button onClick={onClick}>Click</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
