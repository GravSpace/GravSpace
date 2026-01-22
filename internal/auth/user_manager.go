package auth

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"os"
	"strings"
	"sync"
)

type Statement struct {
	Effect   string   `json:"effect"` // Allow, Deny
	Action   []string `json:"action"`
	Resource []string `json:"resource"`
}

type Policy struct {
	Name      string      `json:"name"`
	Version   string      `json:"version"`
	Statement []Statement `json:"statement"`
}

type AccessKey struct {
	AccessKeyID     string `json:"accessKeyId"`
	SecretAccessKey string `json:"secretAccessKey"`
}

type User struct {
	Username   string      `json:"username"`
	AccessKeys []AccessKey `json:"accessKeys"`
	Policies   []Policy    `json:"policies"` // Inline policies for now
}

type UserManager struct {
	Users    map[string]*User `json:"users"`
	filePath string
	mu       sync.RWMutex
}

func NewUserManager(filePath string) (*UserManager, error) {
	um := &UserManager{
		Users:    make(map[string]*User),
		filePath: filePath,
	}

	if _, err := os.Stat(filePath); err == nil {
		data, err := os.ReadFile(filePath)
		if err != nil {
			return nil, err
		}
		if err := json.Unmarshal(data, &um.Users); err != nil {
			return nil, err
		}
	} else {
		// Create default admin user with deterministic keys for demo
		admin := &User{
			Username: "admin",
			AccessKeys: []AccessKey{
				{AccessKeyID: "admin", SecretAccessKey: "adminsecret"},
			},
		}
		um.Users["admin"] = admin

		// Create anonymous user
		um.Users["anonymous"] = &User{Username: "anonymous"}

		um.save()
	}

	// Double check anonymous exists if file was loaded but it was missing
	if _, ok := um.Users["anonymous"]; !ok {
		um.Users["anonymous"] = &User{Username: "anonymous"}
		um.save()
	}

	return um, nil
}

func (um *UserManager) save() error {
	data, err := json.MarshalIndent(um.Users, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(um.filePath, data, 0644)
}

func (um *UserManager) CreateUser(username string) *User {
	um.mu.Lock()
	defer um.mu.Unlock()

	if user, ok := um.Users[username]; ok {
		return user
	}

	user := &User{Username: username}
	um.Users[username] = user
	um.save()
	return user
}

func (um *UserManager) DeleteUser(username string) {
	um.mu.Lock()
	defer um.mu.Unlock()
	delete(um.Users, username)
	um.save()
}

func (um *UserManager) GenerateKey(username string) *AccessKey {
	um.mu.Lock()
	defer um.mu.Unlock()

	user, ok := um.Users[username]
	if !ok {
		return nil
	}

	key := AccessKey{
		AccessKeyID:     generateRandomString(20),
		SecretAccessKey: generateRandomString(40),
	}

	user.AccessKeys = append(user.AccessKeys, key)
	um.save()
	return &key
}

func (um *UserManager) GetUserByKey(keyID string) (*User, string) {
	um.mu.RLock()
	defer um.mu.RUnlock()

	for _, user := range um.Users {
		for _, key := range user.AccessKeys {
			if key.AccessKeyID == keyID {
				return user, key.SecretAccessKey
			}
		}
	}
	return nil, ""
}

func (um *UserManager) AddPolicy(username string, policy Policy) error {
	um.mu.Lock()
	defer um.mu.Unlock()

	user, ok := um.Users[username]
	if !ok {
		return os.ErrNotExist
	}

	user.Policies = append(user.Policies, policy)
	return um.save()
}

func (um *UserManager) RemovePolicy(username, policyName string) error {
	um.mu.Lock()
	defer um.mu.Unlock()

	user, ok := um.Users[username]
	if !ok {
		return os.ErrNotExist
	}

	var next []Policy
	for _, p := range user.Policies {
		if p.Name != policyName {
			next = append(next, p)
		}
	}
	user.Policies = next
	return um.save()
}

func (um *UserManager) CheckPermission(user *User, action, resource string) bool {
	if user.Username == "admin" {
		return true
	}

	allowed := false
	for _, policy := range user.Policies {
		for _, stmt := range policy.Statement {
			if matchAction(stmt.Action, action) && matchResource(stmt.Resource, resource) {
				if stmt.Effect == "Deny" {
					return false
				}
				if stmt.Effect == "Allow" {
					allowed = true
				}
			}
		}
	}
	return allowed
}

func matchAction(actions []string, target string) bool {
	for _, a := range actions {
		if a == "*" || a == target {
			return true
		}
	}
	return false
}

func matchResource(resources []string, target string) bool {
	for _, r := range resources {
		// log.Printf("Matching resource: %s vs %s", r, target)
		if r == "*" {
			return true
		}
		// Basic prefix matching for ARN-like resources: arn:aws:s3:::bucket/key
		if strings.HasSuffix(r, "*") {
			prefix := r[:len(r)-1]
			if strings.HasPrefix(target, prefix) {
				return true
			}
		}
		if r == target {
			return true
		}
	}
	return false
}

func generateRandomString(n int) string {
	b := make([]byte, n/2)
	rand.Read(b)
	return hex.EncodeToString(b)
}
