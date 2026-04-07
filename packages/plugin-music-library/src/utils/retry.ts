/**
 * Retry utility with exponential backoff
 */

export interface RetryOptions {
    maxRetries?: number;
    initialDelay?: number; // in milliseconds
    maxDelay?: number; // in milliseconds
    backoffMultiplier?: number;
    retryableErrors?: (error: any) => boolean;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
    maxRetries: 3,
    initialDelay: 1000, // 1 second
    maxDelay: 30000, // 30 seconds
    backoffMultiplier: 2,
    retryableErrors: (error: any) => {
        // Retry on network errors, timeouts, and 5xx errors
        if (error?.code === 'ECONNRESET' || error?.code === 'ETIMEDOUT' || error?.code === 'ENOTFOUND') {
            return true;
        }
        if (error?.response?.status >= 500 && error?.response?.status < 600) {
            return true;
        }
        // Retry on rate limit errors (429)
        if (error?.response?.status === 429) {
            return true;
        }
        return false;
    },
};

/**
 * Sleep for the specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate delay with exponential backoff
 */
function calculateDelay(attempt: number, options: Required<RetryOptions>): number {
    const delay = options.initialDelay * Math.pow(options.backoffMultiplier, attempt);
    return Math.min(delay, options.maxDelay);
}

/**
 * Retry a function with exponential backoff
 * @param fn The async function to retry
 * @param options Retry configuration options
 * @returns The result of the function
 * @throws The last error if all retries fail
 */
export async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {}
): Promise<T> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    let lastError: any;

    for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error: any) {
            lastError = error;

            // Don't retry if we've exhausted all attempts
            if (attempt >= opts.maxRetries) {
                break;
            }

            // Don't retry if the error is not retryable
            if (!opts.retryableErrors(error)) {
                break;
            }

            // Calculate delay with exponential backoff
            const delay = calculateDelay(attempt, opts);

            // For rate limit errors, use the Retry-After header if available
            if (error?.response?.status === 429) {
                const retryAfter = error.response.headers['retry-after'];
                if (retryAfter) {
                    const retryAfterMs = parseInt(retryAfter, 10) * 1000;
                    await sleep(Math.max(retryAfterMs, delay));
                    continue;
                }
            }

            // Wait before retrying
            await sleep(delay);
        }
    }

    throw lastError;
}

