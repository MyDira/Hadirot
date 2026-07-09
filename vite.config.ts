import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { execSync } from 'node:child_process';
import { sentryVitePlugin } from '@sentry/vite-plugin';

// Best-effort release identifier: short git SHA if available (CI, local repo),
// falling back to the package version so the build never fails just because
// git isn't available in the build environment.
function getReleaseName(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return process.env.npm_package_version || 'dev';
  }
}

const sentryRelease = getReleaseName();
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __SENTRY_RELEASE__: JSON.stringify(sentryRelease),
  },
  plugins: [
    react(),
    // Uploads source maps + creates a Sentry release so production stack
    // traces show original TypeScript file names/line numbers instead of
    // minified bundle references. Only runs when SENTRY_AUTH_TOKEN is set
    // (e.g. in the deploy environment) — local/CI builds without the token
    // skip upload entirely and never fail because of it.
    sentryVitePlugin({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT || 'hadirot',
      authToken: sentryAuthToken,
      disable: !sentryAuthToken,
      telemetry: false,
      release: {
        name: sentryRelease,
      },
      sourcemaps: {
        filesToDeleteAfterUpload: ['dist/**/*.js.map'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    // 'hidden' generates maps (so the Sentry plugin has something to upload)
    // without adding a `//# sourceMappingURL` comment to the shipped JS, so
    // browsers never fetch them directly. filesToDeleteAfterUpload above then
    // removes the .map files from dist once they're uploaded. When no
    // SENTRY_AUTH_TOKEN is configured, skip source maps entirely rather than
    // risk shipping them publicly with no corresponding Sentry upload.
    sourcemap: sentryAuthToken ? 'hidden' : false,
  },
});
