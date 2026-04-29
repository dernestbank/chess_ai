module.exports = {
  preset: 'react-native',
  moduleNameMapper: {
    '^@domain/(.*)$': '<rootDir>/src/domain/$1',
    '^@ui/(.*)$': '<rootDir>/src/ui/$1',
    '^@data/(.*)$': '<rootDir>/src/data/$1',
    '^@api/(.*)$': '<rootDir>/src/api/$1',
    '^@native/(.*)$': '<rootDir>/src/native/$1',
    // Stub packages that are in package.json but not yet npm-installed
    '^react-native-tcp-socket$': '<rootDir>/__mocks__/react-native-tcp-socket.js',
    '^react-native-view-shot$': '<rootDir>/__mocks__/react-native-view-shot.js',
    '^react-native-vision-camera$': '<rootDir>/__mocks__/react-native-vision-camera.js',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-navigation|react-native-quick-sqlite|react-native-safe-area-context|react-native-screens|chess\\.js)/)',
  ],
  setupFiles: ['./jest.setup.js'],
  testPathIgnorePatterns: ['/node_modules/', '/e2e/'],
};
