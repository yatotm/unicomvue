import { execFileSync } from 'node:child_process'
import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv } from 'vite'
import vueDevTools from 'vite-plugin-vue-devtools'
import { loadConfig } from './server/src/config.js'

function readGitValue(args) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return ''
  }
}

// Docker builds have no .git in the context, so CI passes these through instead.
const BRANCH = process.env.APP_BRANCH?.trim() || readGitValue(['rev-parse', '--abbrev-ref', 'HEAD'])
const COMMIT = process.env.APP_COMMIT?.trim() || readGitValue(['rev-parse', '--short', 'HEAD'])
const BUILD_TIME = new Date().toISOString()

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), 'VITE_')
  let proxy
  if (command === 'serve') {
    const api = loadConfig()
    const host = api.host === '0.0.0.0' ? '127.0.0.1' : api.host === '::' ? '::1' : api.host
    const target = env.VITE_DEV_API_TARGET?.trim()
      || `http://${host.includes(':') ? `[${host}]` : host}:${api.port}`
    proxy = {
      '^/(gettoken|ocs_proxy|basicdata_proxy|qci_proxy|healthz)/?(\\?.*)?$': {
        target,
        changeOrigin: false,
      },
    }
  }
  return {
    plugins: [command === 'serve' && vueDevTools(), vue(), tailwindcss()].filter(Boolean),
    define: {
      __APP_BRANCH__: JSON.stringify(BRANCH),
      __APP_COMMIT__: JSON.stringify(COMMIT),
      __APP_BUILD_TIME__: JSON.stringify(BUILD_TIME),
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      proxy,
      host: '127.0.0.1',
      strictPort: true,
    },
    preview: { proxy },
  }
})
