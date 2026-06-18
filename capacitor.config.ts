import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tiaktiak.app',
  appName: 'Tiak Tiak',
  webDir: 'out',
  server: {
    url: 'https://tiak-tiak-zeta.vercel.app',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;