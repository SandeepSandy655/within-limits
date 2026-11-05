const { getDefaultConfig } = require('expo/metro-config');
const fs = require('node:fs');
const path = require('node:path');

const config = getDefaultConfig(__dirname);

// File-map snapshots use V8 serialization. Keep Node upgrades and production
// exports from sharing the development server's snapshot in the system temp folder.
const runtimeCacheKey = `node-${process.versions.node}-v8-${process.versions.v8}`;
const cacheMode = process.env.NODE_ENV === 'production' ? 'production' : 'development';
config.fileMapCacheDirectory = path.join(
  __dirname,
  '.expo',
  'metro-cache',
  runtimeCacheKey,
  cacheMode,
  'file-map'
);
fs.mkdirSync(config.fileMapCacheDirectory, { recursive: true });

// One transformer keeps the development server within this 8 GB machine's memory budget.
// Expo's --max-workers option can override this on a larger build machine.
config.maxWorkers = 1;

// Keep generated bundles and cache writes out of Metro's file graph.
const existingBlockList = config.resolver.blockList || [];
config.resolver.blockList = [
  ...(Array.isArray(existingBlockList) ? existingBlockList : [existingBlockList]),
  ...['dist', 'build', '.expo/navigation-qa', '.expo/metro-cache'].map((directory) => {
    const absolute = path.resolve(__dirname, directory).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${absolute}(?:[/\\\\]|$)`);
  }),
];

module.exports = config;
