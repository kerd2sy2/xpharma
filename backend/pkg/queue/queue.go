package queue

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"log"
	"net"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

var (
	ErrQueueEmpty  = errors.New("queue is empty")
	ErrQueueClosed = errors.New("queue is closed")
)

type MessageBroker interface {
	Enqueue(ctx context.Context, topic string, payload []byte) error
	Dequeue(ctx context.Context, topic string, timeout time.Duration) ([]byte, error)
	Len(ctx context.Context, topic string) (int64, error)
	Close() error
}

// -----------------------------------------------------------------------------
// Resilient In-Memory Buffer Broker (Fallback & Dev)
// -----------------------------------------------------------------------------

type MemoryBroker struct {
	mu     sync.Mutex
	queues map[string]chan []byte
	closed bool
}

func NewMemoryBroker() *MemoryBroker {
	return &MemoryBroker{
		queues: make(map[string]chan []byte),
	}
}

func (m *MemoryBroker) getChannel(topic string) chan []byte {
	m.mu.Lock()
	defer m.mu.Unlock()
	ch, exists := m.queues[topic]
	if !exists {
		ch = make(chan []byte, 10000) // Buffer up to 10k messages per topic
		m.queues[topic] = ch
	}
	return ch
}

func (m *MemoryBroker) Enqueue(ctx context.Context, topic string, payload []byte) error {
	m.mu.Lock()
	if m.closed {
		m.mu.Unlock()
		return ErrQueueClosed
	}
	m.mu.Unlock()

	ch := m.getChannel(topic)
	select {
	case ch <- payload:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	default:
		return errors.New("in-memory queue buffer full")
	}
}

func (m *MemoryBroker) Dequeue(ctx context.Context, topic string, timeout time.Duration) ([]byte, error) {
	ch := m.getChannel(topic)
	select {
	case msg, ok := <-ch:
		if !ok {
			return nil, ErrQueueClosed
		}
		return msg, nil
	case <-time.After(timeout):
		return nil, ErrQueueEmpty
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

func (m *MemoryBroker) Len(ctx context.Context, topic string) (int64, error) {
	ch := m.getChannel(topic)
	return int64(len(ch)), nil
}

func (m *MemoryBroker) Close() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.closed {
		return nil
	}
	m.closed = true
	for _, ch := range m.queues {
		close(ch)
	}
	return nil
}

// -----------------------------------------------------------------------------
// Redis Broker with Native RESP Protocol & Auto-Failover to Memory
// -----------------------------------------------------------------------------

type ResilientRedisBroker struct {
	addr        string
	memoryQueue *MemoryBroker
	mu          sync.Mutex
	useFallback bool
}

func NewResilientBroker() MessageBroker {
	redisAddr := os.Getenv("REDIS_ADDR")
	if redisAddr == "" {
		redisURL := os.Getenv("REDIS_URL")
		if redisURL != "" {
			clean := strings.TrimPrefix(redisURL, "redis://")
			parts := strings.Split(clean, "/")
			redisAddr = parts[0]
		}
	}

	mem := NewMemoryBroker()

	if redisAddr == "" {
		log.Println("[MessageBroker] No REDIS_ADDR provided. Operating with high-capacity in-memory queue.")
		return mem
	}

	broker := &ResilientRedisBroker{
		addr:        redisAddr,
		memoryQueue: mem,
	}

	// Verify initial connection
	conn, err := net.DialTimeout("tcp", redisAddr, 2*time.Second)
	if err != nil {
		log.Printf("[MessageBroker] WARNING: Redis at %s unreachable (%v). Failing over to in-memory queue.", redisAddr, err)
		broker.useFallback = true
	} else {
		conn.Close()
		log.Printf("[MessageBroker] Successfully connected to Redis at %s", redisAddr)
	}

	return broker
}

func (r *ResilientRedisBroker) Enqueue(ctx context.Context, topic string, payload []byte) error {
	if r.useFallback {
		return r.memoryQueue.Enqueue(ctx, topic, payload)
	}

	conn, err := net.DialTimeout("tcp", r.addr, 2*time.Second)
	if err != nil {
		log.Printf("[MessageBroker] Redis write failed (%v); failing over to in-memory fallback", err)
		r.useFallback = true
		return r.memoryQueue.Enqueue(ctx, topic, payload)
	}
	defer conn.Close()

	// RESP LPUSH: *3\r\n$5\r\nLPUSH\r\n$<len topic>\r\n<topic>\r\n$<len payload>\r\n<payload>\r\n
	cmd := fmt.Sprintf("*3\r\n$5\r\nLPUSH\r\n$%d\r\n%s\r\n$%d\r\n%s\r\n",
		len(topic), topic, len(payload), string(payload))

	_, err = conn.Write([]byte(cmd))
	if err != nil {
		r.useFallback = true
		return r.memoryQueue.Enqueue(ctx, topic, payload)
	}

	reader := bufio.NewReader(conn)
	line, err := reader.ReadString('\n')
	if err != nil || !strings.HasPrefix(line, ":") {
		r.useFallback = true
		return r.memoryQueue.Enqueue(ctx, topic, payload)
	}

	return nil
}

func (r *ResilientRedisBroker) Dequeue(ctx context.Context, topic string, timeout time.Duration) ([]byte, error) {
	if r.useFallback {
		return r.memoryQueue.Dequeue(ctx, topic, timeout)
	}

	timeoutSec := int(timeout.Seconds())
	if timeoutSec <= 0 {
		timeoutSec = 1
	}

	conn, err := net.DialTimeout("tcp", r.addr, time.Duration(timeoutSec+2)*time.Second)
	if err != nil {
		return r.memoryQueue.Dequeue(ctx, topic, timeout)
	}
	defer conn.Close()

	// RESP BRPOP: *3\r\n$5\r\nBRPOP\r\n$<len topic>\r\n<topic>\r\n$<len sec>\r\n<sec>\r\n
	cmd := fmt.Sprintf("*3\r\n$5\r\nBRPOP\r\n$%d\r\n%s\r\n$%d\r\n%d\r\n",
		len(topic), topic, len(strconv.Itoa(timeoutSec)), timeoutSec)

	_, err = conn.Write([]byte(cmd))
	if err != nil {
		return r.memoryQueue.Dequeue(ctx, topic, timeout)
	}

	reader := bufio.NewReader(conn)
	line, err := reader.ReadString('\n')
	if err != nil || strings.HasPrefix(line, "*-1") {
		return nil, ErrQueueEmpty
	}

	if strings.HasPrefix(line, "*2") {
		// Read topic bulk string
		_, _ = reader.ReadString('\n') // $len
		_, _ = reader.ReadString('\n') // topic value
		// Read payload bulk string
		lenLine, err := reader.ReadString('\n')
		if err != nil {
			return nil, err
		}
		lenStr := strings.TrimSpace(strings.TrimPrefix(lenLine, "$"))
		payLen, _ := strconv.Atoi(lenStr)
		buf := make([]byte, payLen)
		_, err = reader.Read(buf)
		_, _ = reader.ReadString('\n') // trailing \r\n
		return buf, err
	}

	return nil, ErrQueueEmpty
}

func (r *ResilientRedisBroker) Len(ctx context.Context, topic string) (int64, error) {
	if r.useFallback {
		return r.memoryQueue.Len(ctx, topic)
	}
	return 0, nil
}

func (r *ResilientRedisBroker) Close() error {
	return r.memoryQueue.Close()
}
