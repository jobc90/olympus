import { StringDecoder } from 'string_decoder';

const CTRL_C_BYTE = 0x03;
const WORKER_ESCAPE_BYTE = 0x1d;

export interface PtyStdinBridgeOptions {
  writeToPty: (data: string) => void;
  exitWorker: () => void;
  handleLocalInput?: (decoded: string) => void;
}

export class PtyStdinBridge {
  private decoder = new StringDecoder('utf8');

  constructor(private readonly options: PtyStdinBridgeOptions) {}

  handleData(data: Buffer): void {
    if (data.length === 1 && (data[0] === CTRL_C_BYTE || data[0] === WORKER_ESCAPE_BYTE)) {
      this.options.exitWorker();
      return;
    }

    const decoded = this.decoder.write(data);
    if (!decoded) return;

    this.options.writeToPty(decoded.replace(/\r?\n/g, '\r'));
    this.options.handleLocalInput?.(decoded);
  }

  reset(): void {
    this.decoder.end();
    this.decoder = new StringDecoder('utf8');
  }
}
