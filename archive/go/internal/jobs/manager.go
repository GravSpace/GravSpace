package jobs

import (
	"log"
	"sync"
)

// Job represents a background task
type Job interface {
	Execute() error
	Name() string
}

// Manager handles background job execution using a worker pool
type Manager struct {
	jobChan     chan Job
	workerCount int
	waitGroup   sync.WaitGroup
	quit        chan bool
}

func NewManager(workerCount int) *Manager {
	return &Manager{
		jobChan:     make(chan Job, 1000), // Buffer up to 1000 jobs
		workerCount: workerCount,
		quit:        make(chan bool),
	}
}

func (m *Manager) Start() {
	for i := 0; i < m.workerCount; i++ {
		m.waitGroup.Add(1)
		go m.worker(i)
	}
	log.Printf("Background Job Manager started with %d workers", m.workerCount)
}

func (m *Manager) Stop() {
	close(m.quit)
	close(m.jobChan)
	m.waitGroup.Wait()
	log.Println("Background Job Manager stopped")
}

func (m *Manager) Enqueue(job Job) {
	select {
	case m.jobChan <- job:
		// Job queued successfully
	default:
		log.Printf("Warning: Job queue full, dropping job: %s", job.Name())
	}
}

func (m *Manager) worker(id int) {
	defer m.waitGroup.Done()
	for {
		select {
		case job, ok := <-m.jobChan:
			if !ok {
				return
			}
			// log.Printf("Worker %d starting job: %s", id, job.Name())
			if err := job.Execute(); err != nil {
				log.Printf("Worker %d: Job %s failed: %v", id, job.Name(), err)
			}
		case <-m.quit:
			return
		}
	}
}
