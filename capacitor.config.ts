import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.lineagecollections.portal',
  appName: 'Lineage Collections Portal',
  webDir: 'dist',
  server: {
    url: 'https://www.lineage-portal.com?forceHideBadge=true',
    cleartext: true,
  },
  ios: {
    contentInset: 'automatic',
  },
};

export default config;
