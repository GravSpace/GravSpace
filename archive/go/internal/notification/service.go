package notification

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/GravSpace/GravSpace/internal/database"
)

type NotificationService struct {
	DB *database.Database
}

func NewNotificationService(db *database.Database) *NotificationService {
	return &NotificationService{
		DB: db,
	}
}

type SlackPayload struct {
	Text string `json:"text"`
}

func (s *NotificationService) SendAlert(event, details string) {
	// Get webhook URL from database first, fallback to env var
	webhookURL := ""
	if s.DB != nil {
		dbURL, err := s.DB.GetSystemSetting("slack_webhook_url")
		if err == nil && dbURL != "" {
			webhookURL = dbURL
		}
	}

	// Fallback to environment variable
	if webhookURL == "" {
		webhookURL = os.Getenv("SLACK_WEBHOOK_URL")
	}

	if webhookURL == "" {
		return
	}

	message := fmt.Sprintf(":warning: *%s*\n%s", event, details)
	payload := SlackPayload{Text: message}
	data, err := json.Marshal(payload)
	if err != nil {
		log.Printf("Failed to marshal notification payload: %v", err)
		return
	}

	go func() {
		client := &http.Client{Timeout: 10 * time.Second}
		resp, err := client.Post(webhookURL, "application/json", bytes.NewBuffer(data))
		if err != nil {
			log.Printf("Failed to send notification: %v", err)
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode >= 400 {
			log.Printf("Notification webhook returned status: %d", resp.StatusCode)
		}
	}()
}
