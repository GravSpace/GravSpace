package notifications

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/GravSpace/GravSpace/internal/database"
)

type Dispatcher struct {
	db        *database.Database
	eventChan chan Event
	workers   int
}

type Event struct {
	Bucket    string
	EventName string
	Key       string
	Size      int64
	ETag      string
	VersionID string
}

type S3Event struct {
	Records []S3EventRecord `json:"Records"`
}

type S3EventRecord struct {
	EventVersion string   `json:"eventVersion"`
	EventSource  string   `json:"eventSource"`
	AwsRegion    string   `json:"awsRegion"`
	EventTime    string   `json:"eventTime"`
	EventName    string   `json:"eventName"`
	S3           S3Entity `json:"s3"`
}

type S3Entity struct {
	SchemaVersion   string `json:"s3SchemaVersion"`
	ConfigurationID string `json:"configurationId"`
	Bucket          struct {
		Name string `json:"name"`
		Arn  string `json:"arn"`
	} `json:"bucket"`
	Object struct {
		Key       string `json:"key"`
		Size      int64  `json:"size"`
		ETag      string `json:"eTag"`
		VersionID string `json:"versionId"`
	} `json:"object"`
}

func NewDispatcher(db *database.Database, workerCount int) *Dispatcher {
	return &Dispatcher{
		db:        db,
		eventChan: make(chan Event, 100),
		workers:   workerCount,
	}
}

func (d *Dispatcher) Start() {
	for i := 0; i < d.workers; i++ {
		go d.worker()
	}
}

func (d *Dispatcher) Dispatch(e Event) {
	d.eventChan <- e
}

func (d *Dispatcher) worker() {
	client := &http.Client{Timeout: 10 * time.Second}
	for e := range d.eventChan {
		d.processEvent(e, client)
	}
}

func (d *Dispatcher) processEvent(e Event, client *http.Client) {
	hooks, err := d.db.GetWebhooksByBucket(e.Bucket)
	if err != nil {
		log.Printf("Webhook error fetching hooks for %s: %v", e.Bucket, err)
		return
	}

	for _, h := range hooks {
		if !h.Active {
			continue
		}

		// Check if event type matches
		var supportedEvents []string
		json.Unmarshal([]byte(h.Events), &supportedEvents)

		match := false
		for _, se := range supportedEvents {
			if se == e.EventName || se == "*" {
				match = true
				break
			}
		}

		if match {
			d.sendWebhook(h, e, client)
		}
	}
}

func (d *Dispatcher) sendWebhook(h *database.WebhookRecord, e Event, client *http.Client) {
	payload := S3Event{
		Records: []S3EventRecord{
			{
				EventVersion: "2.1",
				EventSource:  "aws:s3",
				AwsRegion:    "vdev", // Local region
				EventTime:    time.Now().Format(time.RFC3339),
				EventName:    e.EventName,
				S3: S3Entity{
					SchemaVersion:   "1.0",
					ConfigurationID: fmt.Sprintf("hook-%d", h.ID),
					Bucket: struct {
						Name string `json:"name"`
						Arn  string `json:"arn"`
					}{
						Name: e.Bucket,
						Arn:  "arn:aws:s3:::" + e.Bucket,
					},
					Object: struct {
						Key       string `json:"key"`
						Size      int64  `json:"size"`
						ETag      string `json:"eTag"`
						VersionID string `json:"versionId"`
					}{
						Key:       e.Key,
						Size:      e.Size,
						ETag:      e.ETag,
						VersionID: e.VersionID,
					},
				},
			},
		},
	}

	body, _ := json.Marshal(payload)
	req, err := http.NewRequest("POST", h.URL, bytes.NewBuffer(body))
	if err != nil {
		return
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "GravSpace-Webhook-Dispatcher/1.0")
	req.Header.Set("X-GravSpace-Event", e.EventName)

	// HMAC Signature if secret exists
	if h.Secret != "" {
		mac := hmac.New(sha256.New, []byte(h.Secret))
		mac.Write(body)
		signature := hex.EncodeToString(mac.Sum(nil))
		req.Header.Set("X-GravSpace-Signature", signature)
	}

	resp, err := client.Do(req)
	if err != nil {
		log.Printf("Webhook delivery failed to %s: %v", h.URL, err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		log.Printf("Webhook target %s returned status %d", h.URL, resp.StatusCode)
	}
}
