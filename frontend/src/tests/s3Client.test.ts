import { describe, expect, test } from 'vitest'
import {
  createS3Client,
  generateCodeSnippet,
} from '../lib/s3Client'

describe('S3Client and Explorer Helpers', () => {
  const creds = {
    accessKeyId: 'AKIA_TEST_KEY',
    secretAccessKey: 'SECRET_TEST_KEY_123',
  }
  const endpoint = 'http://localhost:9001'

  test('createS3Client initializes with proper configuration', () => {
    const client = createS3Client(endpoint, creds)
    expect(client).toBeDefined()
    expect(client.config).toBeDefined()
  })

  test('generateCodeSnippet outputs valid TypeScript, Python, and CLI snippets', () => {
    const snippets = generateCodeSnippet(
      'PutObject',
      { Bucket: 'my-bucket', Key: 'data.json', Body: '{"ok":true}' },
      creds,
      endpoint,
    )

    expect(snippets.ts).toContain('new PutObjectCommand')
    expect(snippets.ts).toContain('AKIA_TEST_KEY')
    expect(snippets.ts).toContain('SECRET_TEST_KEY_123')
    expect(snippets.ts).toContain('http://localhost:9001')

    expect(snippets.python).toContain('boto3.client')
    expect(snippets.python).toContain('s3.put_object')

    expect(snippets.cli).toContain('aws --endpoint-url="http://localhost:9001" s3api')
    expect(snippets.cli).toContain('--bucket "my-bucket"')
  })
})
