/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'com.toomiiverse.spin',
  productName: 'Spin',
  directories: { output: 'release' },
  files: ['dist/**', 'dist-electron/**', 'package.json'],
  win: { target: 'nsis' },
  nsis: { oneClick: true, perMachine: false },
  publish: null,
};
