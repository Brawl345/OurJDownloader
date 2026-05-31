import { defineConfig } from 'wxt';

const UPDATE_BASE =
  'https://raw.githubusercontent.com/Brawl345/ourjdownloader/master';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  srcDir: '.',
  manifestVersion: 3,
  manifest: ({ browser, mode }) => {
    // Self-hosted update endpoints only matter for production GitHub builds.
    const selfHosted = mode === 'production';
    return {
      name: '__MSG_extensionName__',
      description: '__MSG_extensionDescription__',
      default_locale: 'en',
      action: {
        default_title: '__MSG_extensionName__',
      },
      ...(selfHosted && browser === 'chrome'
        ? { update_url: `${UPDATE_BASE}/updates.xml` }
        : {}),
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
          data_collection_permissions: {
            required: ['authenticationInfo'],
          },
          ...(selfHosted && browser === 'firefox'
            ? { update_url: `${UPDATE_BASE}/updates.json` }
            : {}),
        },
      },
    };
  },
});
