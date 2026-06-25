import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import VideoUpload from './VideoUpload';

const meta: Meta<typeof VideoUpload> = {
  title: 'UI/VideoUpload',
  component: VideoUpload,
  tags: ['autodocs'],
  args: { onUpload: fn() },
};

export default meta;
type Story = StoryObj<typeof VideoUpload>;

export const Default: Story = {
  name: 'Idle (no file selected)',
  args: {},
};

export const WithError: Story = {
  name: 'With Validation Error',
  args: {
    error: 'File size exceeds 100 MB. Please upload a smaller video.',
  },
};

export const UploadingState: Story = {
  name: 'Uploading (visual mock)',
  render: () => (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-300">Highlight Reel</label>
      <div className="relative">
        <input
          type="file"
          accept="video/*"
          disabled
          className="w-full bg-gray-900 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 opacity-50"
        />
        <div className="absolute inset-0 bg-gray-900/80 flex items-center justify-center rounded-lg">
          <div className="flex items-center gap-2 text-brand-green">
            <svg
              className="animate-spin h-5 w-5"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span className="text-sm">Uploading...</span>
          </div>
        </div>
      </div>
    </div>
  ),
};
