/**
 * Throws an error with a descriptive message stating that the code should never be reached.
 * Use this function to make sure that the code is not reached in any case.
 * @param message Descriptive message for the error. Stating the reason why the code should never be reached.
 */
export function neverReached(message: string): never {
  throw new Error(message);
}

