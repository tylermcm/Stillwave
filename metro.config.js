const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const escapedRoot = __dirname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const localBuildFiles = new RegExp(
  `^${escapedRoot}[\\\\/](?:\\.android-build|\\.build-tmp|private|artifacts|dist)(?:[\\\\/].*)?$`,
);
const defaults = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(defaults) ? defaults : defaults ? [defaults] : []),
  localBuildFiles,
];
config.maxWorkers = 2;

module.exports = config;
