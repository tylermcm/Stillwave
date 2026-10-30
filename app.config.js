// Static config lives in app.json; this only adds the web subpath when hosting
// on GitHub Pages (EXPO_BASE_URL=/repo-name), and is a no-op otherwise.
module.exports = ({ config }) => ({
  ...config,
  experiments: { ...config.experiments, ...(process.env.EXPO_BASE_URL ? { baseUrl: process.env.EXPO_BASE_URL } : {}) },
});
