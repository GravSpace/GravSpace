package main

import (
	"context"
	"fmt"
	"log"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

func main() {
	// S3 Configuration
	endpoint := "http://localhost:9001"
	region := "us-east-1"
	accessKey := ""
	secretKey := ""

	// Configure AWS SDK
	customResolver := aws.EndpointResolverWithOptionsFunc(func(service, region string, options ...interface{}) (aws.Endpoint, error) {
		return aws.Endpoint{
			URL:           endpoint,
			SigningRegion: region,
		}, nil
	})

	cfg, err := config.LoadDefaultConfig(context.TODO(),
		config.WithRegion(region),
		config.WithEndpointResolverWithOptions(customResolver),
		config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(accessKey, secretKey, "")),
	)
	if err != nil {
		log.Fatalf("failed to load configuration, %v", err)
	}

	client := s3.NewFromConfig(cfg, func(o *s3.Options) {
		o.UsePathStyle = true
	})

	bucket := "test-gin-migration"
	key := "test-2.txt"
	content := "Hello from Gin-based GravSpace!"

	// 1. Create Bucket
	fmt.Printf("Creating bucket %s...\n", bucket)
	_, err = client.CreateBucket(context.TODO(), &s3.CreateBucketInput{
		Bucket: aws.String(bucket),
	})
	if err != nil {
		log.Printf("Warning: CreateBucket failed (might already exist): %v", err)
	} else {
		fmt.Println("Bucket created successfully.")
	}

	// 2. Put Object
	fmt.Printf("Uploading object %s...\n", key)
	_, err = client.PutObject(context.TODO(), &s3.PutObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
		Body:   strings.NewReader(content),
	})
	if err != nil {
		log.Fatalf("PutObject failed: %v", err)
	}
	fmt.Println("Object uploaded successfully.")

	// 3. Get Object
	fmt.Printf("Downloading object %s...\n", key)
	resp, err := client.GetObject(context.TODO(), &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		log.Fatalf("GetObject failed: %v", err)
	}
	defer resp.Body.Close()
	fmt.Println("Object downloaded successfully.")

	// 4. List Objects
	fmt.Println("Listing objects...")
	listResp, err := client.ListObjectsV2(context.TODO(), &s3.ListObjectsV2Input{
		Bucket: aws.String(bucket),
	})
	if err != nil {
		log.Fatalf("ListObjectsV2 failed: %v", err)
	}
	for _, obj := range listResp.Contents {
		fmt.Printf(" - %s (%d bytes)\n", *obj.Key, obj.Size)
	}

	// 5. Delete Object
	fmt.Printf("Deleting object %s...\n", key)
	_, err = client.DeleteObject(context.TODO(), &s3.DeleteObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		log.Fatalf("DeleteObject failed: %v", err)
	}
	fmt.Println("Object deleted successfully.")

	// 6. Delete Bucket
	fmt.Printf("Deleting bucket %s...\n", bucket)
	_, err = client.DeleteBucket(context.TODO(), &s3.DeleteBucketInput{
		Bucket: aws.String(bucket),
	})
	if err != nil {
		log.Fatalf("DeleteBucket failed: %v", err)
	}
	fmt.Println("Bucket deleted successfully.")

	fmt.Println("\nS3 API Migration Verification PASSED!")
}
