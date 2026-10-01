import type { Preview, Decorator } from '@storybook/react';
import '@subtrack/ui-tokens/tokens.css';

const withTheme: Decorator = (Story, context) => {
  const theme = context.globals['theme'] as string | undefined;
  return (
    <div data-theme={theme ?? 'light'} style={{ padding: '1rem', minHeight: '100vh', background: 'var(--bg-canvas)', color: 'var(--ink-primary)' }}>
      <Story />
    </div>
  );
};

const preview: Preview = {
  decorators: [withTheme],
  globalTypes: {
    theme: {
      description: 'Global theme for components',
      defaultValue: 'light',
      toolbar: {
        title: 'Theme',
        icon: 'circlehollow',
        items: [
          { value: 'light', icon: 'sun', title: 'Light' },
          { value: 'dark', icon: 'moon', title: 'Dark' },
        ],
        dynamicTitle: true,
      },
    },
  },
  parameters: {
    backgrounds: { disable: true },
    layout: 'fullscreen',
  },
};

export default preview;
