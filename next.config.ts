import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  outputFileTracingRoot: import.meta.dirname,
  outputFileTracingIncludes: {
    '/api/focus': [
      './node_modules/onnxruntime-node/{package.json,dist/**}',
      './node_modules/onnxruntime-node/bin/napi-v6/linux/x64/**',
      './node_modules/onnxruntime-common/**',
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
