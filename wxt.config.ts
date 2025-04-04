import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: 'Notisky Notifications',
    description: 'A Web Extension that enhances Bluesky with notification features',
    version: '1.0.0',
    icons: {
      16: 'icon/16.png',
      48: 'icon/48.png',
      128: 'icon/128.png'
    },
    permissions: [
      'notifications',
      'alarms',
      'tabs',
      'storage'
    ],
    host_permissions: [
      '*://bsky.app/*',
      '*://*.bsky.social/*',
      '*://notisky-auth.vercel.app/*'
    ],
    web_accessible_resources: [
      {
        resources: ['assets/*', 'icon/*'],
        matches: ['*://bsky.app/*', '*://*.bsky.social/*']
      }
    ],
    // Include Firefox specific settings
    browser_specific_settings: {
      gecko: {
        id: 'notisky@extension.app'
      }
    }
  },
  runner: {
    startUrls: ['https://bsky.app/']
  },
  entrypoints: {
    background: {
      import: './entrypoints/background.ts'
    },
    content: './entrypoints/content.ts',
    popup: './entrypoints/popup/index.html',
    options: './entrypoints/options/index.html'
  },
  modules: ['@wxt-dev/module-react'],
  outDir: 'dist',
  srcDir: '.',
  publicDir: 'public',
  browser: ['chrome', 'firefox', 'safari']
});
