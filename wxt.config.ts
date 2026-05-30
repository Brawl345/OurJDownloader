import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  srcDir: '.',
  manifestVersion: 3,
  manifest: {
    name: '__MSG_extensionName__',
    description: '__MSG_extensionDescription__',
    default_locale: 'en',
    action: {
      default_title: '__MSG_extensionName__',
    },
    permissions: [
      'activeTab',
      'contextMenus',
      'notifications',
      'storage',
      'declarativeNetRequest',
      'webRequest',
    ],
    host_permissions: ['http://*/*', 'https://*/*'],
    declarative_net_request: {
      rule_resources: [
        {
          id: 'cnl_rules',
          enabled: false,
          path: 'cnl-rules.json',
        },
      ],
    },
    web_accessible_resources: [
      {
        resources: ['/web_accessible_resources/jdcheck.js'],
        matches: ['http://*/*', 'https://*/*'],
      },
    ],
    browser_specific_settings: {
      gecko: {
        id: 'ourjdownloader@brawl345.github.com',
        strict_min_version: '140.0',
      },
    },
  },
});
