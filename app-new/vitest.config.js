import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // Use jsdom environment for browser API mocking
    environment: 'jsdom',
    // Global test setup
    globals: true,
    // Setup file for testing-library
    setupFiles: ['./src/test/setup.js'],
    // Include patterns
    include: ['src/**/*.{test,spec}.{js,jsx,ts,tsx}'],
    // Exclude patterns
    exclude: ['node_modules', 'dist'],
    // Coverage configuration (optional)
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules', 'dist', '**/*.test.js'],
    },
  },
});
