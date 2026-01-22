package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/url"
	"sort"
	"strings"
)

// CalculateSignature implements S3 V4 Signing logic
func CalculateSignature(secretKey, date, region, service, stringToSign string) string {
	signingKey := getSignatureKey(secretKey, date, region, service)
	return hmacHash(signingKey, stringToSign)
}

func getSignatureKey(key, dateStamp, regionName, serviceName string) []byte {
	kDate := hmacHashRaw([]byte("AWS4"+key), dateStamp)
	kRegion := hmacHashRaw(kDate, regionName)
	kService := hmacHashRaw(kRegion, serviceName)
	kSigning := hmacHashRaw(kService, "aws4_request")
	return kSigning
}

func hmacHashRaw(key []byte, data string) []byte {
	h := hmac.New(sha256.New, key)
	h.Write([]byte(data))
	return h.Sum(nil)
}

func hmacHash(key []byte, data string) string {
	return hex.EncodeToString(hmacHashRaw(key, data))
}

// BuildCanonicalRequest creates the canonical request string
func BuildCanonicalRequest(method, path string, query url.Values, headers http.Header, signedHeaders []string, payloadHash string, requestHost string) string {
	// 1. HTTP Method
	// 2. Canonical URI
	canonicalURI := path
	if canonicalURI == "" {
		canonicalURI = "/"
	}

	// 3. Canonical Query String
	var queryParts []string
	for k, vs := range query {
		if k == "X-Amz-Signature" {
			continue
		}
		for _, v := range vs {
			queryParts = append(queryParts, fmt.Sprintf("%s=%s", url.QueryEscape(k), url.QueryEscape(v)))
		}
	}
	sort.Strings(queryParts)
	canonicalQuery := strings.Join(queryParts, "&")

	// 4. Canonical Headers
	var headerParts []string
	for _, h := range signedHeaders {
		lowH := strings.ToLower(h)
		val := strings.TrimSpace(headers.Get(h))
		if val == "" && lowH == "host" {
			val = requestHost
		}
		headerParts = append(headerParts, fmt.Sprintf("%s:%s\n", lowH, val))
	}
	canonicalHeaders := strings.Join(headerParts, "")

	// 5. Signed Headers
	signedHeadersStr := strings.Join(signedHeaders, ";")

	// 6. Payload Hash (x-amz-content-sha256 or UNSIGNED-PAYLOAD)
	if payloadHash == "" {
		payloadHash = "UNSIGNED-PAYLOAD"
	}

	return fmt.Sprintf("%s\n%s\n%s\n%s\n%s\n%s",
		method,
		canonicalURI,
		canonicalQuery,
		canonicalHeaders,
		signedHeadersStr,
		payloadHash,
	)
}

// BuildStringToSign creates the string to sign
func BuildStringToSign(algorithm, amzDate, credentialScope, canonicalRequest string) string {
	h := sha256.New()
	h.Write([]byte(canonicalRequest))
	hashedReq := hex.EncodeToString(h.Sum(nil))

	return fmt.Sprintf("%s\n%s\n%s\n%s",
		algorithm,
		amzDate,
		credentialScope,
		hashedReq,
	)
}
