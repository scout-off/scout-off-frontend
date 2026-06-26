export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class ContractPausedError extends Error {
  constructor() {
    super('ContractPaused');
    this.name = 'ContractPausedError';
  }
}
