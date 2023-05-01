/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation.
 * This is especially useful for Docker builds.
 */
!process.env.SKIP_ENV_VALIDATION &&
  (await import("agent-roger-core/src/env.mjs/index.js"));

/** @type {import("next").NextConfig} */
const config = {
  reactStrictMode: true,
};
export default config;
