export default interface Logger {
  debug: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string, error?: unknown) => void;
}
