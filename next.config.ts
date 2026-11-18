import type { NextConfig } from 'next'

const onnx = ['./node_modules/onnxruntime-node/{package.json,dist/**}', './node_modules/onnxruntime-node/bin/napi-v6/linux/x64/**', './node_modules/onnxruntime-common/**']

const nextConfig: NextConfig = {
  outputFileTracingRoot: import.meta.dirname,
  outputFileTracingIncludes: {
    '/api/focus': onnx,
    '/api/segment': onnx,
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
