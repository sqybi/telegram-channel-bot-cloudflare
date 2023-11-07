export class TcbFatalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TcbFatalError';
  }
}
