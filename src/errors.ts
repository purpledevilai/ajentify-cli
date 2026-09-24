/**
 * Single error class for everything the CLI raises intentionally. The CLI
 * entry catches these and prints `.message` without a stack trace, exiting
 * 1. Unknown thrown values fall through and print with their stack so bugs
 * are visible.
 */
export class AjentifyError extends Error {
  override name = "AjentifyError";

  constructor(message: string) {
    super(message);
  }
}
