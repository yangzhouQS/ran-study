import { defineConfig } from '@rsbuild/core';
import { pluginVue } from '@rsbuild/plugin-vue';
import { pluginVueJsx } from '@rsbuild/plugin-vue-jsx';

export default defineConfig({
  plugins: [pluginVue(), pluginVueJsx()],
  source: {
    entry: { index: './src/main.ts' },
    alias: { '@': './src' },
  },
  html: { template: './index.html' },
  output: { distPath: { root: 'dist' } },
  server: { port: 3000 },
});
