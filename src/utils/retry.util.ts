/**
 * withRetry
 * Utility for executing an async function with exponential backoff retry logic.
 *
 * @param fn The async function to execute
 * @param maxRetries Maximum number of retry attempts (default: 3)
 * @param baseDelay Initial delay in milliseconds (default: 1000)
 */
export const withRetry = async <T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000,
): Promise<T> => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      // If it's the last attempt, throw the error
      if (i === maxRetries - 1) {
        console.error(`[RETRY] All ${maxRetries} attempts failed.`, err);
        throw err;
      }

      // Calculate exponential delay with jitter
      const delay = baseDelay * Math.pow(2, i) + Math.random() * 100;

      console.warn(
        `[RETRY] Attempt ${i + 1} failed. Error: ${err.message}. Retrying in ${Math.round(
          delay,
        )}ms...`,
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error('Unreachable state in withRetry');
};
