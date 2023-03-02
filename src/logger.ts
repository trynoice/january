export interface Logger {
  debug: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
}

class NamedLogger implements Logger {
  private readonly parent: Logger;
  private readonly name: string;

  public constructor(parent: Logger, name: string) {
    this.parent = parent;
    this.name = name;
  }

  public debug(message: string) {
    this.parent.debug(`${this.name}: ${message}`);
  }

  public info(message: string) {
    this.parent.info(`${this.name}: ${message}`);
  }

  public warn(message: string) {
    this.parent.warn(`${this.name}: ${message}`);
  }
}

export function createNamedLogger(
  parent: Logger | undefined,
  name: string
): Logger | undefined {
  return parent ? new NamedLogger(parent, name) : undefined;
}

export enum ConsoleLogLevel {
  Debug,
  Info,
  Warn,
}

export class ConsoleLogger implements Logger {
  private minLogLevel: ConsoleLogLevel;

  public constructor(minLevel?: ConsoleLogLevel) {
    this.minLogLevel = minLevel ?? ConsoleLogLevel.Debug;
  }

  public debug(message: string) {
    if (this.minLogLevel <= ConsoleLogLevel.Debug) {
      console.debug(message);
    }
  }

  public info(message: string) {
    if (this.minLogLevel <= ConsoleLogLevel.Info) {
      console.info(message);
    }
  }

  public warn(message: string) {
    if (this.minLogLevel <= ConsoleLogLevel.Warn) {
      console.warn(message);
    }
  }
}
