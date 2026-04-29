module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    [
      'module-resolver',
      {
        root: ['.'],
        alias: {
          '@domain': './src/domain',
          '@ui': './src/ui',
          '@data': './src/data',
          '@api': './src/api',
          '@native': './src/native',
        },
      },
    ],
  ],
};
