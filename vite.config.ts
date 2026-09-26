import { defineConfig, loadEnv } from 'vite';
import { flypickApi } from './server/api.ts';

export default defineConfig(({ mode }) => {
  // Server-only secrets: no VITE_ prefix, so they never reach client code.
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [flypickApi(env.FIRECRAWL_API_KEY)],
    // menu captures and run logs are written while the app runs; they must not reload the page
    server: { watch: { ignored: ['**/src/data/fixtures/**', '**/runs/**'] } },
    worker: { format: 'es' },
  };
});
