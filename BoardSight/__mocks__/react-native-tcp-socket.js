const TcpSocket = {
  createServer: jest.fn(() => ({
    listen: jest.fn(),
    close: jest.fn(),
    on: jest.fn(),
    address: jest.fn(() => ({ address: '127.0.0.1', port: 54321 })),
  })),
  createConnection: jest.fn(() => ({
    write: jest.fn(),
    destroy: jest.fn(),
    on: jest.fn(),
  })),
};
module.exports = { __esModule: true, default: TcpSocket };
