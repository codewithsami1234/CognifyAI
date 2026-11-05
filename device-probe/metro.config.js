const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

const projectRoot = __dirname;
const aiSource = path.resolve(projectRoot, '..', 'src');

/**
 * Bundle the existing AI library from the parent src folder.
 * llama.rn is installed in this app, while the adapter file lives beside it.
 */
const config = {
  watchFolders: [aiSource],
  resolver: {
    nodeModulesPaths: [path.resolve(projectRoot, 'node_modules')],
    disableHierarchicalLookup: true,
    extraNodeModules: {
      'llama.rn': path.resolve(projectRoot, 'node_modules', 'llama.rn'),
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
