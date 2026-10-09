package ingestion

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"xpharma-backend/pkg/queue"
)

const IngestTopic = "xpharma:ingest:tasks"

type IngestionTask struct {
	JobID     string           `json:"job_id"`
	TenantID  string           `json:"tenant_id"`
	Payload   IngestionPayload `json:"payload"`
	CreatedAt time.Time        `json:"created_at"`
}

type WorkerPool struct {
	broker      queue.MessageBroker
	service     *IngestionService
	workerCount int
	stopCh      chan struct{}
	wg          sync.WaitGroup
}

func NewWorkerPool(broker queue.MessageBroker, service *IngestionService, workerCount int) *WorkerPool {
	if workerCount <= 0 {
		workerCount = 8
	}
	return &WorkerPool{
		broker:      broker,
		service:     service,
		workerCount: workerCount,
		stopCh:      make(chan struct{}),
	}
}

func (p *WorkerPool) Start() {
	log.Printf("[IngestionWorkerPool] Starting %d background ingestion workers on topic '%s'...", p.workerCount, IngestTopic)
	for i := 1; i <= p.workerCount; i++ {
		p.wg.Add(1)
		go p.workerLoop(i)
	}
}

func (p *WorkerPool) Stop() {
	close(p.stopCh)
	p.wg.Wait()
	log.Println("[IngestionWorkerPool] All workers gracefully stopped.")
}

func (p *WorkerPool) workerLoop(workerID int) {
	defer p.wg.Done()

	for {
		select {
		case <-p.stopCh:
			return
		default:
		}

		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		data, err := p.broker.Dequeue(ctx, IngestTopic, 2*time.Second)
		cancel()

		if err != nil {
			if err == queue.ErrQueueEmpty {
				time.Sleep(100 * time.Millisecond)
				continue
			}
			if err == queue.ErrQueueClosed {
				return
			}
			time.Sleep(200 * time.Millisecond)
			continue
		}

		var task IngestionTask
		if err := json.Unmarshal(data, &task); err != nil {
			log.Printf("[Worker-%d] ERROR: Corrupt ingestion task: %v", workerID, err)
			continue
		}

		// Execute with retry
		err = p.processWithRetry(task, 3)
		if err != nil {
			log.Printf("[Worker-%d] FATAL: Failed task %s for tenant %s after retries: %v", workerID, task.JobID, task.TenantID, err)
		} else {
			log.Printf("[Worker-%d] SUCCESS: Completed task %s (tenant: %s, invoices: %d)",
				workerID, task.JobID, task.TenantID, len(task.Payload.Invoices))
		}
	}
}

func (p *WorkerPool) processWithRetry(task IngestionTask, maxRetries int) error {
	var lastErr error
	delay := 300 * time.Millisecond

	for attempt := 1; attempt <= maxRetries; attempt++ {
		ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
		err := p.service.ProcessPayload(ctx, task.TenantID, &task.Payload)
		cancel()

		if err == nil {
			return nil
		}

		lastErr = err
		log.Printf("[IngestionWorker] Attempt %d/%d failed for task %s: %v. Retrying in %v...",
			attempt, maxRetries, task.JobID, err, delay)
		time.Sleep(delay)
		delay *= 2
	}

	return fmt.Errorf("exhausted %d retries: %w", maxRetries, lastErr)
}
