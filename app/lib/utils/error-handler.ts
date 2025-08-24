export interface APIError {
  status: number;
  message: string;
  code?: string;
  retryAfter?: number;
}

export class APIErrorHandler {
  // Standard retry configuration
  static readonly DEFAULT_MAX_RETRIES = 3;
  static readonly DEFAULT_BASE_DELAY = 1000; // 1 second
  static readonly DEFAULT_MAX_DELAY = 30000; // 30 seconds

  // Check if error is retryable
  static isRetryable(error: any): boolean {
    if (!error) return false;

    // Network errors are usually retryable
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      return true;
    }

    // HTTP status codes that are typically retryable
    const retryableStatuses = [
      408, // Request Timeout
      429, // Too Many Requests
      500, // Internal Server Error
      502, // Bad Gateway
      503, // Service Unavailable
      504, // Gateway Timeout
    ];

    if (error.status && retryableStatuses.includes(error.status)) {
      return true;
    }

    return false;
  }

  // Extract retry delay from error
  static getRetryDelay(error: any, attempt: number): number {
    // If server provides Retry-After header
    if (error.retryAfter) {
      return error.retryAfter * 1000;
    }

    // For rate limiting (429), use exponential backoff with jitter
    if (error.status === 429) {
      const exponentialDelay = Math.min(
        this.DEFAULT_BASE_DELAY * Math.pow(2, attempt),
        this.DEFAULT_MAX_DELAY
      );
      
      // Add jitter (0-50% of the delay)
      const jitter = Math.random() * exponentialDelay * 0.5;
      return exponentialDelay + jitter;
    }

    // Default exponential backoff
    return Math.min(
      this.DEFAULT_BASE_DELAY * Math.pow(2, attempt),
      this.DEFAULT_MAX_DELAY
    );
  }

  // Create standardized error from various sources
  static createError(error: any): APIError {
    if (error instanceof Response) {
      return {
        status: error.status,
        message: error.statusText || `HTTP ${error.status}`,
        retryAfter: error.headers.get('Retry-After') 
          ? parseInt(error.headers.get('Retry-After')!) 
          : undefined
      };
    }

    if (error?.error) {
      // Spotify API error format
      if (error.error.status && error.error.message) {
        return {
          status: error.error.status,
          message: error.error.message
        };
      }
    }

    // Apple Music API error format
    if (error?.errors && Array.isArray(error.errors)) {
      const firstError = error.errors[0];
      return {
        status: firstError.status ? parseInt(firstError.status) : 500,
        message: firstError.title || firstError.detail || 'API Error'
      };
    }

    // Generic error
    return {
      status: error.status || 500,
      message: error.message || 'Unknown error occurred'
    };
  }
}

// Retry function with exponential backoff
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries = APIErrorHandler.DEFAULT_MAX_RETRIES,
  onRetry?: (attempt: number, error: any) => void
): Promise<T> {
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Don't retry on last attempt
      if (attempt === maxRetries) {
        break;
      }

      // Only retry if error is retryable
      if (!APIErrorHandler.isRetryable(error)) {
        throw APIErrorHandler.createError(error);
      }

      const delay = APIErrorHandler.getRetryDelay(error, attempt);
      
      if (onRetry) {
        onRetry(attempt + 1, error);
      }

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw APIErrorHandler.createError(lastError);
}

// Circuit breaker pattern for critical failures
export class CircuitBreaker {
  private failures = 0;
  private nextAttempt = 0;
  private readonly threshold: number;
  private readonly timeout: number;

  constructor(threshold = 5, timeout = 60000) { // 5 failures, 60 second timeout
    this.threshold = threshold;
    this.timeout = timeout;
  }

  async call<T>(operation: () => Promise<T>): Promise<T> {
    if (this.isOpen()) {
      throw new Error('Circuit breaker is open. Service temporarily unavailable.');
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private isOpen(): boolean {
    return this.failures >= this.threshold && Date.now() < this.nextAttempt;
  }

  private onSuccess(): void {
    this.failures = 0;
    this.nextAttempt = 0;
  }

  private onFailure(): void {
    this.failures++;
    
    if (this.failures >= this.threshold) {
      this.nextAttempt = Date.now() + this.timeout;
    }
  }

  getState(): { failures: number; isOpen: boolean } {
    return {
      failures: this.failures,
      isOpen: this.isOpen()
    };
  }
}

// Specialized error types
export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class RateLimitError extends Error {
  public retryAfter?: number;

  constructor(message: string, retryAfter?: number) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

export class ServiceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServiceUnavailableError';
  }
}

// Error logging utility
export function logError(error: any, context: string): void {
  const timestamp = new Date().toISOString();
  const errorInfo = {
    timestamp,
    context,
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
      status: error.status,
      code: error.code
    }
  };

  console.error('Application Error:', errorInfo);

  // In production, you might want to send this to an error tracking service
  // like Sentry, LogRocket, or similar
}

// Graceful degradation helper
export function gracefulFallback<T>(
  primaryOperation: () => Promise<T>,
  fallbackOperation: () => Promise<T>,
  fallbackCondition: (error: any) => boolean = () => true
): Promise<T> {
  return primaryOperation().catch(error => {
    logError(error, 'Primary operation failed, attempting fallback');
    
    if (fallbackCondition(error)) {
      return fallbackOperation();
    }
    
    throw error;
  });
}