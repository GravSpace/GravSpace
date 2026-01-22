package s3

import (
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/rizal/storage-object/internal/auth"
)

type AdminHandler struct {
	UserManager *auth.UserManager
}

func (h *AdminHandler) ListUsers(c echo.Context) error {
	return c.JSON(http.StatusOK, h.UserManager.Users)
}

func (h *AdminHandler) CreateUser(c echo.Context) error {
	var req struct {
		Username string `json:"username"`
	}
	if err := c.Bind(&req); err != nil {
		return err
	}
	user := h.UserManager.CreateUser(req.Username)
	return c.JSON(http.StatusCreated, user)
}

func (h *AdminHandler) DeleteUser(c echo.Context) error {
	username := c.Param("username")
	h.UserManager.DeleteUser(username)
	return c.NoContent(http.StatusOK)
}

func (h *AdminHandler) GenerateKey(c echo.Context) error {
	username := c.Param("username")
	key := h.UserManager.GenerateKey(username)
	if key == nil {
		return c.NoContent(http.StatusNotFound)
	}
	return c.JSON(http.StatusOK, key)
}

func (h *AdminHandler) AddPolicy(c echo.Context) error {
	username := c.Param("username")
	var policy auth.Policy
	if err := c.Bind(&policy); err != nil {
		return err
	}
	if err := h.UserManager.AddPolicy(username, policy); err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusOK)
}

func (h *AdminHandler) RemovePolicy(c echo.Context) error {
	username := c.Param("username")
	policyName := c.Param("name")
	if err := h.UserManager.RemovePolicy(username, policyName); err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusOK)
}

func (h *AdminHandler) GetSystemStats(c echo.Context) error {
	// Dummy stats for now
	stats := map[string]interface{}{
		"total_users": len(h.UserManager.Users),
		"uptime":      "running",
	}
	return c.JSON(http.StatusOK, stats)
}
