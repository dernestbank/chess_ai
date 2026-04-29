// Mock native modules that are not available in the Jest environment

jest.mock('react-native-quick-sqlite', () => ({
  open: jest.fn(() => ({
    execute: jest.fn(() => ({ rows: { _array: [], length: 0 }, rowsAffected: 0 })),
    close: jest.fn(),
  })),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@react-native-clipboard/clipboard', () => ({
  __esModule: true,
  default: {
    setString: jest.fn(),
    getString: jest.fn().mockResolvedValue(''),
  },
}));

// Silence expected React key warnings from FlatList in tests
const originalError = console.error;
console.error = (...args) => {
  if (
    typeof args[0] === 'string' &&
    (args[0].includes('Warning:') || args[0].includes('Each child'))
  ) {
    return;
  }
  originalError.call(console, ...args);
};
