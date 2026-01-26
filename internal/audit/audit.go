package audit

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/GravSpace/GravSpace/internal/database"
)

type AuditLog struct {
	Timestamp time.Time         `json:"timestamp"`
	User      string            `json:"user"`
	Action    string            `json:"action"`
	Resource  string            `json:"resource"`
	Result    string            `json:"result"` // "success" or "denied"
	IP        string            `json:"ip"`
	UserAgent string            `json:"user_agent,omitempty"`
	Details   map[string]string `json:"details,omitempty"`
}

type AuditLogger struct {
	logFile *os.File
	db      *database.Database
}

func NewAuditLogger(logPath string, db *database.Database) (*AuditLogger, error) {
	// Ensure log directory exists
	dir := filepath.Dir(logPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, err
	}

	// Open log file in append mode
	file, err := os.OpenFile(logPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return nil, err
	}

	return &AuditLogger{
		logFile: file,
		db:      db,
	}, nil
}

func (a *AuditLogger) Log(entry AuditLog) error {
	entry.Timestamp = time.Now()

	jsonData, err := json.Marshal(entry)
	if err != nil {
		return err
	}

	// Save to file
	if a.logFile != nil {
		a.logFile.WriteString(string(jsonData) + "\n")
	}

	// Save to database
	if a.db != nil {
		detailsJSON, _ := json.Marshal(entry.Details)
		a.db.CreateAuditLog(&database.AuditLogRecord{
			Timestamp: entry.Timestamp,
			Username:  entry.User,
			Action:    entry.Action,
			Resource:  entry.Resource,
			Result:    entry.Result,
			IP:        entry.IP,
			UserAgent: entry.UserAgent,
			Details:   string(detailsJSON),
		})
	}

	// Also print to stdout for container logs
	fmt.Println(string(jsonData))

	return nil
}

func (a *AuditLogger) LogSuccess(user, action, resource, ip, userAgent string, details map[string]string) {
	a.Log(AuditLog{
		User:      user,
		Action:    action,
		Resource:  resource,
		Result:    "success",
		IP:        ip,
		UserAgent: userAgent,
		Details:   details,
	})
}

func (a *AuditLogger) LogDenied(user, action, resource, ip, userAgent, reason string) {
	details := map[string]string{
		"reason": reason,
	}
	a.Log(AuditLog{
		User:      user,
		Action:    action,
		Resource:  resource,
		Result:    "denied",
		IP:        ip,
		UserAgent: userAgent,
		Details:   details,
	})
}

func (a *AuditLogger) Close() error {
	if a.logFile != nil {
		return a.logFile.Close()
	}
	return nil
}
