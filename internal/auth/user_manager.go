package auth

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"os"
	"strings"
	"sync"

	"github.com/GravSpace/GravSpace/internal/database"
	"golang.org/x/crypto/bcrypt"
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
	DB       *database.Database
	Users    map[string]*User  // Cache for performance, but sync with DB
	Policies map[string]Policy // Global policy templates
	mu       sync.RWMutex
}

func NewUserManager(db *database.Database) (*UserManager, error) {
	um := &UserManager{
		Users:    make(map[string]*User),
		Policies: make(map[string]Policy),
		DB:       db,
	}

	if db != nil {
		if err := um.LoadFromDB(); err != nil {
			return nil, err
		}
	}

	return um, nil
}

func (um *UserManager) LoadFromDB() error {
	um.mu.Lock()
	defer um.mu.Unlock()

	usernames, err := um.DB.ListUsers()
	if err != nil {
		return err
	}

	for _, username := range usernames {
		userRecord, err := um.DB.GetUser(username)
		if err != nil {
			return err
		}
		if userRecord == nil {
			continue
		}

		user := &User{
			Username: userRecord.Username,
		}

		// Load keys
		keys, err := um.DB.GetAccessKeys(username)
		if err != nil {
			return err
		}
		for _, k := range keys {
			user.AccessKeys = append(user.AccessKeys, AccessKey{
				AccessKeyID:     k.AccessKeyID,
				SecretAccessKey: k.SecretAccessKey,
			})
		}

		// Load policies
		policies, err := um.DB.GetUserPolicies(username)
		if err != nil {
			return err
		}
		for _, p := range policies {
			var policy Policy
			if err := json.Unmarshal([]byte(p.Data), &policy); err != nil {
				continue
			}
			user.Policies = append(user.Policies, policy)
		}

		um.Users[username] = user
	}

	// Double check anonymous
	if _, ok := um.Users["anonymous"]; !ok {
		um.Users["anonymous"] = &User{Username: "anonymous"}
		um.DB.UpsertUser("anonymous", "")
	}

	// Load global policies
	globalPolicies, err := um.DB.ListGlobalPolicies()
	if err != nil {
		return err
	}
	for name, data := range globalPolicies {
		var policy Policy
		if err := json.Unmarshal([]byte(data), &policy); err == nil {
			policy.Name = name // Ensure name matches the key
			um.Policies[name] = policy
		}
	}

	return nil
}

func (um *UserManager) CreatePolicyTemplate(name string, policy Policy) error {
	um.mu.Lock()
	defer um.mu.Unlock()

	policy.Name = name
	data, err := json.Marshal(policy)
	if err != nil {
		return err
	}

	if err := um.DB.UpsertGlobalPolicy(name, string(data)); err != nil {
		return err
	}

	um.Policies[name] = policy
	return nil
}

func (um *UserManager) ListPolicyTemplates() []Policy {
	um.mu.RLock()
	defer um.mu.RUnlock()

	var list []Policy
	for _, p := range um.Policies {
		list = append(list, p)
	}
	return list
}

func (um *UserManager) DeletePolicyTemplate(name string) error {
	um.mu.Lock()
	defer um.mu.Unlock()

	if err := um.DB.DeleteGlobalPolicy(name); err != nil {
		return err
	}

	delete(um.Policies, name)
	return nil
}

func (um *UserManager) CreateUser(username string) *User {
	um.mu.Lock()
	defer um.mu.Unlock()

	if user, ok := um.Users[username]; ok {
		return user
	}

	user := &User{Username: username}
	um.Users[username] = user

	if um.DB != nil {
		um.DB.UpsertUser(username, "")
	}
	return user
}

func (um *UserManager) DeleteUser(username string) {
	um.mu.Lock()
	defer um.mu.Unlock()
	delete(um.Users, username)

	if um.DB != nil {
		um.DB.DeleteUser(username)
	}
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

	if um.DB != nil {
		um.DB.CreateAccessKey(username, key.AccessKeyID, key.SecretAccessKey)
	}
	return &key
}

func (um *UserManager) DeleteKey(username, keyID string) error {
	um.mu.Lock()
	defer um.mu.Unlock()

	user, ok := um.Users[username]
	if !ok {
		return os.ErrNotExist
	}

	var next []AccessKey
	for _, k := range user.AccessKeys {
		if k.AccessKeyID != keyID {
			next = append(next, k)
		}
	}
	user.AccessKeys = next

	if um.DB != nil {
		return um.DB.DeleteAccessKey(keyID)
	}
	return nil
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

	if um.DB != nil {
		pJSON, _ := json.Marshal(policy)
		return um.DB.UpsertUserPolicy(username, policy.Name, string(pJSON))
	}
	return nil
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

	if um.DB != nil {
		return um.DB.DeleteUserPolicy(username, policyName)
	}
	return nil
}

func (um *UserManager) AttachPolicyTemplate(username, templateName string) error {
	um.mu.Lock()
	defer um.mu.Unlock()

	// Get the global policy template
	template, ok := um.Policies[templateName]
	if !ok {
		return os.ErrNotExist
	}

	user, ok := um.Users[username]
	if !ok {
		return os.ErrNotExist
	}

	// Check if policy already attached
	for _, p := range user.Policies {
		if p.Name == templateName {
			return os.ErrExist
		}
	}

	// Add the template to user's policies
	user.Policies = append(user.Policies, template)

	// Persist to database
	if um.DB != nil {
		pJSON, _ := json.Marshal(template)
		return um.DB.UpsertUserPolicy(username, template.Name, string(pJSON))
	}
	return nil
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

func (um *UserManager) Authenticate(username, password string) (*User, error) {
	um.mu.RLock()
	defer um.mu.RUnlock()

	userRecord, err := um.DB.GetUser(username)
	if err != nil {
		return nil, err
	}
	if userRecord == nil {
		return nil, os.ErrNotExist
	}

	if err := bcrypt.CompareHashAndPassword([]byte(userRecord.PasswordHash), []byte(password)); err != nil {
		return nil, err
	}

	return um.Users[username], nil
}

func (um *UserManager) UpdatePassword(username, newPassword string) error {
	um.mu.Lock()
	defer um.mu.Unlock()

	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	if um.DB != nil {
		if err := um.DB.UpsertUser(username, string(hash)); err != nil {
			return err
		}
	}

	// Password changed successfully, return nil
	return nil
}

func generateRandomString(n int) string {
	b := make([]byte, n/2)
	rand.Read(b)
	return hex.EncodeToString(b)
}
