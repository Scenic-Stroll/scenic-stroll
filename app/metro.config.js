// Metro bundler settings. Expo's defaults, plus one change for the web build:
// react-native-maps has no web version, so on web we use our MapLibre stand-in instead
// (app/src/lib/web-map, DECISIONS D41). Phones keep using the real react-native-maps.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const WEB_MAP = path.resolve(__dirname, 'src/lib/web-map/index.tsx');
const defaultResolve = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'react-native-maps') {
    return { type: 'sourceFile', filePath: WEB_MAP };
  }
  return (defaultResolve ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
