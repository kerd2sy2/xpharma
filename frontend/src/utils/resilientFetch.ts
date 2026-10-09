/**
 * Resilient HTTP Client with Circuit Breaker, Exponential Backoff, and Graceful Fallback
 * Designed for extreme fault tolerance across mobile networks.
 */

export interface ResilientRequestOptions extends RequestInit {
  timeoutMs?: number;
  retries?: number;
  backoffFactor?: number;
  initialDelayMs?: number;
  fallback?: any;
  serviceName?: string;
}

enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

interface CircuitRecord {
  state: CircuitState;
  failures: number;
  lastFailureTime: number;
  nextAttemptTime: number;
}

const circuitRegistry: Map<string, CircuitRecord> = new Map();

const FAILURE_THRESHOLD = 4;
const RESET_TIMEOUT_MS = 20000; // 20s cooldown before half-open probe

function getCircuit(name: string): CircuitRecord {
  let record = circuitRegistry.get(name);
  if (!record) {
    record = {
      state: CircuitState.CLOSED,
      failures: 0,
      lastFailureTime: 0,
      nextAttemptTime: 0,
    };
    circuitRegistry.set(name, record);
  }
  return record;
}

function recordSuccess(name: string) {
  const circuit = getCircuit(name);
  circuit.failures = 0;
  circuit.state = CircuitState.CLOSED;
}

function recordFailure(name: string) {
  const circuit = getCircuit(name);
  circuit.failures += 1;
  circuit.lastFailureTime = Date.now();
  if (circuit.failures >= FAILURE_THRESHOLD) {
    circuit.state = CircuitState.OPEN;
    circuit.nextAttemptTime = Date.now() + RESET_TIMEOUT_MS;
    console.warn(`[CircuitBreaker] Circuit '${name}' tripped OPEN due to ${circuit.failures} consecutive failures. Entering cooldown.`);
  }
}

function checkCircuit(name: string): boolean {
  const circuit = getCircuit(name);
  if (circuit.state === CircuitState.OPEN) {
    if (Date.now() > circuit.nextAttemptTime) {
      circuit.state = CircuitState.HALF_OPEN;
      console.info(`[CircuitBreaker] Circuit '${name}' entering HALF_OPEN probe state.`);
      return true;
    }
    return false; // Fast-fail
  }
  return true;
}

export async function resilientFetch<T = any>(
  url: string,
  options: ResilientRequestOptions = {}
): Promise<T> {
  const {
    timeoutMs = 8000,
    retries = 2,
    backoffFactor = 2,
    initialDelayMs = 600,
    fallback = null,
    serviceName = new URL(url).hostname,
    ...fetchOptions
  } = options;

  if (!checkCircuit(serviceName)) {
    console.warn(`[CircuitBreaker] Fast-failing request to ${url} (Circuit OPEN). Returning fallback.`);
    if (fallback !== null) return fallback as T;
    throw new Error(`Service '${serviceName}' is temporarily unavailable (Circuit OPEN). Please retry shortly.`);
  }

  let attempt = 0;
  let delay = initialDelayMs;

  while (attempt <= retries) {
    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });
      clearTimeout(timeoutTimer);

      if (response.ok) {
        recordSuccess(serviceName);
        const data = await response.json();
        return data as T;
      }

      // 5xx Server errors warrant retries and circuit breaker failure tracking
      if (response.status >= 500) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      // 4xx Client errors should not trigger circuit breaker failures
      const clientErr = await response.json().catch(() => ({}));
      return clientErr as T;
    } catch (err: any) {
      clearTimeout(timeoutTimer);
      attempt++;

      if (attempt > retries) {
        recordFailure(serviceName);
        if (fallback !== null) {
          console.warn(`[ResilientFetch] All ${retries + 1} attempts to ${url} failed. Gracefully returning fallback state:`, err?.message);
          return fallback as T;
        }
        throw err;
      }

      // Exponential backoff with jitter
      const jitter = Math.random() * 200;
      await new Promise((resolve) => setTimeout(resolve, delay + jitter));
      delay *= backoffFactor;
    }
  }

  if (fallback !== null) return fallback as T;
  throw new Error(`Network request to ${url} exhausted retries.`);
}
