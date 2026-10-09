import time
import asyncio
from enum import Enum
from typing import Callable, Any, Optional

class CircuitState(str, Enum):
    CLOSED = "CLOSED"
    OPEN = "OPEN"
    HALF_OPEN = "HALF_OPEN"

class CircuitBreakerOpenException(Exception):
    """Raised when request is rejected because Circuit is OPEN."""
    pass

class CircuitBreaker:
    def __init__(self, name: str, max_failures: int = 3, reset_timeout: int = 20):
        self.name = name
        self.max_failures = max_failures
        self.reset_timeout = reset_timeout
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.last_failure_time = 0.0
        self._lock = asyncio.Lock()

    async def execute(self, coro_func: Callable[[], Any], fallback: Optional[Callable[[], Any]] = None) -> Any:
        async with self._lock:
            now = time.time()
            if self.state == CircuitState.OPEN:
                if now - self.last_failure_time > self.reset_timeout:
                    self.state = CircuitState.HALF_OPEN
                    print(f"[CircuitBreaker:{self.name}] Cooldown expired; entering HALF_OPEN state.")
                else:
                    if fallback:
                        return await fallback() if asyncio.iscoroutinefunction(fallback) else fallback()
                    raise CircuitBreakerOpenException(f"Circuit '{self.name}' is OPEN. Fast-failing.")

        try:
            result = await coro_func()
            async with self._lock:
                if self.state == CircuitState.HALF_OPEN:
                    print(f"[CircuitBreaker:{self.name}] Probe call succeeded; closing circuit.")
                self.failure_count = 0
                self.state = CircuitState.CLOSED
            return result
        except Exception as exc:
            async with self._lock:
                self.failure_count += 1
                self.last_failure_time = time.time()
                if self.state == CircuitState.HALF_OPEN or self.failure_count >= self.max_failures:
                    self.state = CircuitState.OPEN
                    print(f"[CircuitBreaker:{self.name}] Tripped OPEN after {self.failure_count} failures: {exc}")
            if fallback:
                return await fallback() if asyncio.iscoroutinefunction(fallback) else fallback()
            raise exc

llm_circuit_breaker = CircuitBreaker("LLM-Reasoning-Engine", max_failures=3, reset_timeout=25)
