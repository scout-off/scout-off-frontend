import type { Meta, StoryObj } from '@storybook/react';
import { useEffect } from 'react';
import ThemeToggle from './ui/ThemeToggle';
import { ThemeProvider } from '@/context/ThemeContext';
import type { Theme } from '@/context/ThemeContext';

const STORAGE_KEY = 'scoutoff_theme_preference';

const meta: Meta<typeof ThemeToggle> = {
  title: 'Components/ThemeToggle',
  component: ThemeToggle,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof ThemeToggle>;

function ThemeStory({ initialTheme }: { initialTheme: Theme }) {
  localStorage.setItem(STORAGE_KEY, initialTheme);

  useEffect(() => {
    return () => {
      localStorage.removeItem(STORAGE_KEY);
      document.documentElement.classList.remove('light', 'dark');
    };
  }, []);

  return (
    <ThemeProvider>
      <div className="inline-flex items-center gap-2 rounded border border-gray-300 bg-white p-2 text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100">
        <ThemeToggle />
        <span>{initialTheme} theme active</span>
      </div>
    </ThemeProvider>
  );
}

export const LightThemeActive: Story = {
  render: () => <ThemeStory initialTheme="light" />,
};

export const DarkThemeActive: Story = {
  render: () => <ThemeStory initialTheme="dark" />,
};
