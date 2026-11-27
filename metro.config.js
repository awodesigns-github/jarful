// Expo's default Metro config, plus Rive files (.riv) as bundled assets
// (assets/rive/note-drop.riv, loaded by components/jar/DropJar.tsx).
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('riv');

module.exports = config;
