/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding", "@coinbase/cdp-sdk");
    config.resolve.alias = {
      ...config.resolve.alias,
      "@x402/svm/exact/client": false,
      "@x402/svm": false,
      "@x402/evm/upto/client": false,
      "@x402/evm/exact/client": false,
      "@x402/core/client": false,
      "@x402/evm": false,
      "@x402/core": false,
    };
    config.resolve.fallback = {
      ...config.resolve.fallback,
      "@x402/svm/exact/client": false,
      "@x402/svm": false,
      "@x402/evm/upto/client": false,
      "@x402/evm/exact/client": false,
      "@x402/core/client": false,
      "@x402/evm": false,
      "@x402/core": false,
    };
    return config;
  },
};

module.exports = nextConfig;

