import type { NextConfig } from "next";

export const oauthCallbackLogPattern = /\/api\/connections\/[^/]+\/callback(?:\?|$)/;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  logging: {
    incomingRequests: {
      // OAuth callbacks contain short-lived codes and state. Do not print their query strings in development logs.
      ignore: [oauthCallbackLogPattern],
    },
  },
};

export default nextConfig;
