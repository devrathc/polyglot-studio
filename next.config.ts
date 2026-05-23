import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // If you access the dev server from another device on your LAN (or via a
  // network-mapped Cursor/VS Code workspace), Next 16 will reject the HMR
  // websocket as cross-origin and the page reloads in a tight loop. Add your
  // LAN IP here to allowlist it. Find it with `ipconfig getifaddr en0` on
  // macOS. Globs like `192.168.*.*` are accepted; CIDR ranges are not.
  allowedDevOrigins: [
    // '192.168.1.100',
  ],
};

export default config;
