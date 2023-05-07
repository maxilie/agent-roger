/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation.
 * This is especially useful for Docker builds.
 */
!process.env.SKIP_ENV_VALIDATION && (await import("agent-roger-core"));

/** @type {import("next").NextConfig} */
const config = {
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback.fs = false;
      config.resolve.fallback.dns = false;
      config.resolve.fallback.tls = false;
      config.resolve.fallback.net = false;
    }

    return config;
  },
};

const sharedPackages = [
  "../task-runner",
  "../agent-roger-core",
  "../../libs/@eslint-config-base",
];

const withTM = require("next-transpile-modules")(sharedPackages);

export default withTM(config);
