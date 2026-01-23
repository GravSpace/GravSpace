package metrics

import (
	"strconv"
	"time"

	"github.com/labstack/echo/v4"
)

// Middleware returns an Echo middleware that records Prometheus metrics.
func Middleware() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			if c.Path() == "/metrics" {
				return next(c)
			}

			start := time.Now()
			req := c.Request()

			// Get request size
			reqSize := float64(req.ContentLength)
			if reqSize < 0 {
				reqSize = 0
			}

			err := next(c)

			status := c.Response().Status
			if err != nil {
				if e, ok := err.(*echo.HTTPError); ok {
					status = e.Code
				}
			}

			elapsed := time.Since(start).Seconds()
			method := req.Method
			path := c.Path()
			statusStr := strconv.Itoa(status)

			RequestsTotal.WithLabelValues(method, statusStr, path).Inc()
			RequestDuration.WithLabelValues(method, path).Observe(elapsed)
			RequestSize.WithLabelValues(method, path).Observe(reqSize)
			ResponseSize.WithLabelValues(method, path).Observe(float64(c.Response().Size))

			return err
		}
	}
}
