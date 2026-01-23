package health

import (
	"net/http"
	"os"
	"time"

	"github.com/labstack/echo/v4"
)

type HealthStatus struct {
	Status    string            `json:"status"`
	Timestamp time.Time         `json:"timestamp"`
	Checks    map[string]string `json:"checks,omitempty"`
}

type HealthChecker struct {
	StartTime time.Time
}

func NewHealthChecker() *HealthChecker {
	return &HealthChecker{
		StartTime: time.Now(),
	}
}

// Liveness probe - indicates if the application is running
func (h *HealthChecker) LivenessHandler(c echo.Context) error {
	status := HealthStatus{
		Status:    "UP",
		Timestamp: time.Now(),
	}
	return c.JSON(http.StatusOK, status)
}

// Readiness probe - indicates if the application is ready to serve traffic
func (h *HealthChecker) ReadinessHandler(c echo.Context) error {
	checks := make(map[string]string)
	allHealthy := true

	// Check disk space
	diskStatus := h.checkDiskSpace()
	checks["disk"] = diskStatus
	if diskStatus != "UP" {
		allHealthy = false
	}

	// Check if data directory is writable
	dataStatus := h.checkDataDirectory()
	checks["data_directory"] = dataStatus
	if dataStatus != "UP" {
		allHealthy = false
	}

	status := HealthStatus{
		Timestamp: time.Now(),
		Checks:    checks,
	}

	if allHealthy {
		status.Status = "UP"
		return c.JSON(http.StatusOK, status)
	} else {
		status.Status = "DOWN"
		return c.JSON(http.StatusServiceUnavailable, status)
	}
}

// Startup probe - indicates if the application has started successfully
func (h *HealthChecker) StartupHandler(c echo.Context) error {
	// Consider the app started if it's been running for at least 5 seconds
	if time.Since(h.StartTime) < 5*time.Second {
		return c.JSON(http.StatusServiceUnavailable, HealthStatus{
			Status:    "STARTING",
			Timestamp: time.Now(),
		})
	}

	return c.JSON(http.StatusOK, HealthStatus{
		Status:    "UP",
		Timestamp: time.Now(),
	})
}

func (h *HealthChecker) checkDiskSpace() string {
	// Simple check: try to get file stats on data directory
	_, err := os.Stat("./data")
	if err != nil {
		return "DOWN"
	}
	return "UP"
}

func (h *HealthChecker) checkDataDirectory() string {
	// Try to create a temp file to verify write access
	testFile := "./data/.health_check"
	err := os.WriteFile(testFile, []byte("test"), 0644)
	if err != nil {
		return "DOWN"
	}
	os.Remove(testFile)
	return "UP"
}
