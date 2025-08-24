// Rate limiting utility for API calls
export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  backoffMs?: number;
}

export class RateLimiter {
  private requests: number[] = [];
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly backoffMs: number;

  constructor(config: RateLimitConfig) {
    this.maxRequests = config.maxRequests;
    this.windowMs = config.windowMs;
    this.backoffMs = config.backoffMs || 1000;
  }

  // Check if we can make a request
  canMakeRequest(): boolean {
    const now = Date.now();
    
    // Remove old requests outside the window
    this.requests = this.requests.filter(timestamp => now - timestamp < this.windowMs);
    
    return this.requests.length < this.maxRequests;
  }

  // Wait if necessary, then record the request
  async throttle(): Promise<void> {
    while (!this.canMakeRequest()) {
      await new Promise(resolve => setTimeout(resolve, this.backoffMs));
    }
    
    this.requests.push(Date.now());
  }

  // Get current usage statistics
  getUsage(): { current: number; max: number; resetIn: number } {
    const now = Date.now();
    this.requests = this.requests.filter(timestamp => now - timestamp < this.windowMs);
    
    const oldestRequest = this.requests[0];
    const resetIn = oldestRequest ? this.windowMs - (now - oldestRequest) : 0;
    
    return {
      current: this.requests.length,
      max: this.maxRequests,
      resetIn
    };
  }
}

// Pre-configured rate limiters for different services
export const spotifyRateLimiter = new RateLimiter({
  maxRequests: 100, // Conservative estimate
  windowMs: 60000, // 1 minute window
  backoffMs: 1000
});

export const appleMusicRateLimiter = new RateLimiter({
  maxRequests: 60, // Based on typical API limits
  windowMs: 60000, // 1 minute window
  backoffMs: 1000
});

// Queue-based request manager for handling burst requests
export class RequestQueue {
  private queue: Array<() => Promise<any>> = [];
  private processing = false;
  private rateLimiter: RateLimiter;
  private maxConcurrent: number;
  private currentlyProcessing = 0;

  constructor(rateLimiter: RateLimiter, maxConcurrent = 3) {
    this.rateLimiter = rateLimiter;
    this.maxConcurrent = maxConcurrent;
  }

  // Add request to queue
  async enqueue<T>(request: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await request();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      this.processQueue();
    });
  }

  // Process queued requests
  private async processQueue(): Promise<void> {
    if (this.processing || this.currentlyProcessing >= this.maxConcurrent) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0 && this.currentlyProcessing < this.maxConcurrent) {
      const request = this.queue.shift();
      
      if (request) {
        this.currentlyProcessing++;
        
        // Wait for rate limit
        await this.rateLimiter.throttle();
        
        // Process request
        request().finally(() => {
          this.currentlyProcessing--;
        });
      }
    }

    this.processing = false;
  }

  // Get queue statistics
  getStats(): { queued: number; processing: number; rateLimitUsage: ReturnType<RateLimiter['getUsage']> } {
    return {
      queued: this.queue.length,
      processing: this.currentlyProcessing,
      rateLimitUsage: this.rateLimiter.getUsage()
    };
  }
}

// Create pre-configured request queues
export const spotifyRequestQueue = new RequestQueue(spotifyRateLimiter, 3);
export const appleMusicRequestQueue = new RequestQueue(appleMusicRateLimiter, 2);

// Decorator function to add rate limiting to any async function
export function rateLimited<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  rateLimiter: RateLimiter
): T {
  return (async (...args: any[]) => {
    await rateLimiter.throttle();
    return fn(...args);
  }) as T;
}

// Batch request helper
export async function batchRequests<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  batchSize = 5,
  delayBetweenBatches = 1000
): Promise<R[]> {
  const results: R[] = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    
    // Process batch in parallel
    const batchResults = await Promise.allSettled(
      batch.map(item => processor(item))
    );
    
    // Extract successful results
    const successfulResults = batchResults
      .filter((result) => result.status === 'fulfilled')
      .map(result => (result as PromiseFulfilledResult<R>).value);
    
    results.push(...successfulResults);
    
    // Delay between batches (except for the last batch)
    if (i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
    }
  }
  
  return results;
}