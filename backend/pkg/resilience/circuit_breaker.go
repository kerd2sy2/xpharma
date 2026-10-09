package resilience

import (
	"errors"
	"log"
	"sync"
	"time"
)

type State string

const (
	StateClosed   State = "CLOSED"
	StateHalfOpen State = "HALF_OPEN"
	StateOpen     State = "OPEN"
)

var (
	ErrCircuitOpen = errors.New("circuit breaker is open; service temporarily unavailable")
)

type CircuitBreaker struct {
	mu          sync.RWMutex
	name        string
	state       State
	failures    int
	threshold   int
	cooldown    time.Duration
	openedAt    time.Time
	lastAttempt time.Time
}

func NewCircuitBreaker(name string, threshold int, cooldown time.Duration) *CircuitBreaker {
	if threshold <= 0 {
		threshold = 5
	}
	if cooldown <= 0 {
		cooldown = 15 * time.Second
	}
	return &CircuitBreaker{
		name:      name,
		state:     StateClosed,
		threshold: threshold,
		cooldown:  cooldown,
	}
}

func (cb *CircuitBreaker) Execute(action func() error, fallback func(err error) error) error {
	if !cb.allowExecution() {
		if fallback != nil {
			return fallback(ErrCircuitOpen)
		}
		return ErrCircuitOpen
	}

	err := action()
	if err != nil {
		cb.recordFailure()
		if fallback != nil {
			return fallback(err)
		}
		return err
	}

	cb.recordSuccess()
	return nil
}

func (cb *CircuitBreaker) allowExecution() bool {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	switch cb.state {
	case StateClosed:
		return true
	case StateOpen:
		if time.Since(cb.openedAt) > cb.cooldown {
			cb.state = StateHalfOpen
			log.Printf("[CircuitBreaker:%s] Cooldown expired; entering HALF_OPEN probe state", cb.name)
			return true
		}
		return false
	case StateHalfOpen:
		return true
	default:
		return true
	}
}

func (cb *CircuitBreaker) recordSuccess() {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	if cb.state == StateHalfOpen {
		log.Printf("[CircuitBreaker:%s] Probe successful; closing circuit", cb.name)
	}
	cb.failures = 0
	cb.state = StateClosed
}

func (cb *CircuitBreaker) recordFailure() {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	cb.failures++
	if cb.state == StateHalfOpen || cb.failures >= cb.threshold {
		cb.state = StateOpen
		cb.openedAt = time.Now()
		log.Printf("[CircuitBreaker:%s] Tripped OPEN due to %d failures. Cooldown: %v", cb.name, cb.failures, cb.cooldown)
	}
}

func (cb *CircuitBreaker) GetState() State {
	cb.mu.RLock()
	defer cb.mu.RUnlock()
	return cb.state
}
