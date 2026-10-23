import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  outputFileTracingRoot: import.meta.dirname,
  outputFileTracingExcludes: {
    '/api/focus': [
      './node_modules/onnxruntime-node/bin/napi-v6/{darwin,win32}/**',
      './node_modules/onnxruntime-node/bin/napi-v6/linux/arm64/**',
      './node_modules/onnxruntime-web/**',
    ],
  },
  turbopack: {
    root: import.meta.dirname,
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
}

export default nextConfig
