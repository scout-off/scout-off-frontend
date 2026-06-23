import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import ErrorBoundary from './ErrorBoundary';
import Button from './Button';

const meta: Meta<typeof ErrorBoundary> = {
  title: 'UI/ErrorBoundary',
  component: ErrorBoundary,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof ErrorBoundary>;

function ThrowOnMount() {
  throw new Error('Simulated render error for Storybook preview');
}

function CrashableChild() {
  const [shouldCrash, setShouldCrash] = useState(false);
  if (shouldCrash) throw new Error('User-triggered crash');
  return (
    <div className="p-4 border border-gray-700 rounded-xl text-gray-300 space-y-3">
      <p className="text-white font-medium">Healthy child component</p>
      <p className="text-sm text-gray-400">Click the button below to simulate a render error.</p>
      <Button variant="danger" onClick={() => setShouldCrash(true)}>Trigger Error</Button>
    </div>
  );
}

export const WithHealthyChildren: Story = {
  name: 'Healthy (no error)',
  render: () => (
    <ErrorBoundary>
      <div className="p-4 border border-gray-700 rounded-xl text-gray-300">
        <p className="text-white font-medium">Child component rendered successfully.</p>
        <p className="text-sm text-gray-400 mt-1">ErrorBoundary is active but not triggered.</p>
      </div>
    </ErrorBoundary>
  ),
};

export const Triggered: Story = {
  name: 'Error State (default fallback)',
  render: () => (
    <ErrorBoundary>
      <ThrowOnMount />
    </ErrorBoundary>
  ),
};

export const CustomFallback: Story = {
  name: 'Error State (custom fallback)',
  render: () => (
    <ErrorBoundary
      fallback={
        <div className="p-6 border border-yellow-500 rounded-xl text-center space-y-2">
          <p className="text-yellow-400 font-semibold">Custom error UI</p>
          <p className="text-gray-400 text-sm">This is a custom fallback passed via the fallback prop.</p>
        </div>
      }
    >
      <ThrowOnMount />
    </ErrorBoundary>
  ),
};

export const Interactive: Story = {
  name: 'Interactive (crash and retry)',
  render: () => (
    <ErrorBoundary>
      <CrashableChild />
    </ErrorBoundary>
  ),
};
