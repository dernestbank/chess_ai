declare module 'react-native-tcp-socket' {
  interface TcpSocketOptions {
    host?: string;
    port: number;
    localAddress?: string;
    reuseAddress?: boolean;
    tls?: boolean;
    tlsCheckValidity?: boolean;
    tlsCert?: string;
    interface?: 'wifi' | 'cellular' | 'ethernet';
  }
  type DataHandler = (data: any) => void;
  type ErrorHandler = (err: Error) => void;
  type CloseHandler = (hadError?: boolean) => void;

  interface TcpSocket {
    on(event: 'data', handler: DataHandler): this;
    on(event: 'error', handler: ErrorHandler): this;
    on(event: 'close', handler: CloseHandler): this;
    on(event: 'connect', handler: () => void): this;
    write(data: string | Uint8Array, encoding?: string): void;
    destroy(): void;
    end(): void;
  }

  interface TcpServer {
    listen(options: { port: number; host?: string }, callback?: () => void): void;
    close(callback?: () => void): void;
    on(event: 'error', handler: ErrorHandler): this;
    address(): { port: number; address: string; family: string } | null;
  }

  function createServer(connectionListener: (socket: TcpSocket) => void): TcpServer;
  function createConnection(options: TcpSocketOptions, callback?: () => void): TcpSocket;

  export { createServer, createConnection };
  export default { createServer, createConnection };
}
