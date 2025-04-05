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
      'storage',
      'identity'
    ],
    host_permissions: [
      '*://bsky.app/*',
      '*://*.bsky.social/*',
      '*://notisky.symm.app/*',
      '*://*.bsky.social/xrpc/*',
      '*://localhost:3000/*'
    ],
    web_accessible_resources: [
      {
        resources: ['assets/*', 'icon/*'],
        matches: ['*://bsky.app/*', '*://*.bsky.social/*', '*://notisky.symm.app/*', '*://localhost:3000/*']
      }
    ],
    // Include Firefox specific settings
    browser_specific_settings: {
      gecko: {
        id: 'notisky@extension.app'
      }
    },
    // Allow the GitHub Pages site to communicate with the extension
    externally_connectable: {
      matches: ['*://notisky.symm.app/*', '*://localhost:3000/*']
    },
    // Add external message listener to receive messages from auth server
    background: {
      service_worker: 'background.js'
    },
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'",
      sandbox: "sandbox allow-scripts; script-src 'self' 'unsafe-eval'; object-src 'self'"
    },
    // Add OAuth2 configuration for smoother identity flow
    oauth2: {
      client_id: 'notisky-extension',
      scopes: [
        'read',
        'write'
      ]
    },
    key: process.env.EXTENSION_KEY || undefined
  },
  webExt: {
    startUrls: ['https://bsky.app/']
  },
  entrypoints: {
    background: {
      import: './entrypoints/background.ts'
    },
    content: './entrypoints/content.ts',
    'content-auth-callback': {
      import: './entrypoints/content-auth-callback.ts',
      matches: ['*://notisky.symm.app/auth/extension-callback*', '*://notisky.symm.app/auth-ext.html*']
    },
    'content-auth-detector': {
      import: './entrypoints/content-auth-detector.ts',
      matches: [
        '*://notisky.symm.app/auth-success.html*',
        '*://localhost:3000/auth-success.html*'
      ]
    },
    popup: './entrypoints/popup/index.html',
    options: './entrypoints/options/index.html'
  },
  modules: ['@wxt-dev/module-react'],
  outDir: 'dist',
  srcDir: '.',
  publicDir: 'public',
  browser: ['chrome', 'firefox', 'safari'],
  vite: (env) => ({
    optimizeDeps: {
      include: [
        '@atproto/api',
        '@atproto/did-resolver' // Explicitly include
      ],
    },
    // Remove ssr.noExternal for now
    // ssr: {
    //   noExternal: [
    //     '@atproto/api',
    //     '@atproto/did-resolver' 
    //   ],
    // },
  })
});
