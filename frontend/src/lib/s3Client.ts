import {
  S3Client,
  ListBucketsCommand,
  CreateBucketCommand,
  DeleteBucketCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
  GetBucketCorsCommand,
  PutBucketCorsCommand,
  GetBucketVersioningCommand,
  PutBucketVersioningCommand,
  GetObjectTaggingCommand,
  PutObjectTaggingCommand,
} from '@aws-sdk/client-s3'

export interface S3Credentials {
  accessKeyId: string
  secretAccessKey: string
}

export interface S3ExecutionResult {
  success: boolean
  command: string
  status?: number
  latencyMs: number
  data?: any
  error?: string
  rawError?: any
}

export function createS3Client(endpoint: string, creds: S3Credentials): S3Client {
  return new S3Client({
    endpoint: endpoint.trim() || 'http://localhost:9001',
    region: 'us-east-1',
    credentials: {
      accessKeyId: creds.accessKeyId.trim(),
      secretAccessKey: creds.secretAccessKey.trim(),
    },
    forcePathStyle: true,
  })
}

export async function executeS3Command(
  client: S3Client,
  action: string,
  params: Record<string, any>,
): Promise<S3ExecutionResult> {
  const start = performance.now()
  try {
    let result: any = null
    switch (action) {
      case 'ListBuckets':
        result = await client.send(new ListBucketsCommand({}))
        break
      case 'HeadBucket':
        result = await client.send(new HeadBucketCommand({ Bucket: params.Bucket }))
        break
      case 'CreateBucket':
        result = await client.send(new CreateBucketCommand({ Bucket: params.Bucket }))
        break
      case 'DeleteBucket':
        result = await client.send(new DeleteBucketCommand({ Bucket: params.Bucket }))
        break
      case 'ListObjectsV2':
        result = await client.send(
          new ListObjectsV2Command({
            Bucket: params.Bucket,
            Prefix: params.Prefix || undefined,
            Delimiter: params.Delimiter || undefined,
            MaxKeys: params.MaxKeys ? Number(params.MaxKeys) : undefined,
          }),
        )
        break
      case 'HeadObject':
        result = await client.send(
          new HeadObjectCommand({ Bucket: params.Bucket, Key: params.Key }),
        )
        break
      case 'GetObject': {
        const getRes = await client.send(
          new GetObjectCommand({ Bucket: params.Bucket, Key: params.Key }),
        )
        const bodyStr = await getRes.Body?.transformToString()
        result = {
          ContentType: getRes.ContentType,
          ContentLength: getRes.ContentLength,
          ETag: getRes.ETag,
          LastModified: getRes.LastModified,
          Body: bodyStr,
        }
        break
      }
      case 'PutObject':
        result = await client.send(
          new PutObjectCommand({
            Bucket: params.Bucket,
            Key: params.Key,
            Body: params.Body ?? '',
            ContentType: params.ContentType || 'text/plain',
          }),
        )
        break
      case 'DeleteObject':
        result = await client.send(
          new DeleteObjectCommand({ Bucket: params.Bucket, Key: params.Key }),
        )
        break
      case 'CopyObject':
        result = await client.send(
          new CopyObjectCommand({
            Bucket: params.Bucket,
            Key: params.Key,
            CopySource: params.CopySource,
          }),
        )
        break
      case 'GetBucketCors':
        result = await client.send(new GetBucketCorsCommand({ Bucket: params.Bucket }))
        break
      case 'PutBucketCors':
        result = await client.send(
          new PutBucketCorsCommand({
            Bucket: params.Bucket,
            CORSConfiguration:
              typeof params.CORSConfiguration === 'string'
                ? JSON.parse(params.CORSConfiguration)
                : params.CORSConfiguration,
          }),
        )
        break
      case 'GetBucketVersioning':
        result = await client.send(new GetBucketVersioningCommand({ Bucket: params.Bucket }))
        break
      case 'PutBucketVersioning':
        result = await client.send(
          new PutBucketVersioningCommand({
            Bucket: params.Bucket,
            VersioningConfiguration: { Status: params.Status || 'Enabled' },
          }),
        )
        break
      case 'GetObjectTagging':
        result = await client.send(
          new GetObjectTaggingCommand({ Bucket: params.Bucket, Key: params.Key }),
        )
        break
      case 'PutObjectTagging':
        result = await client.send(
          new PutObjectTaggingCommand({
            Bucket: params.Bucket,
            Key: params.Key,
            Tagging: { TagSet: params.TagSet || [] },
          }),
        )
        break
      default:
        throw new Error(`Unsupported S3 Command: ${action}`)
    }

    const latencyMs = Math.round(performance.now() - start)
    return {
      success: true,
      command: action,
      status: result?.$metadata?.httpStatusCode ?? 200,
      latencyMs,
      data: result,
    }
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - start)
    return {
      success: false,
      command: action,
      status: err?.$metadata?.httpStatusCode ?? 400,
      latencyMs,
      error: err?.message || String(err),
      rawError: err,
    }
  }
}

export function generateCodeSnippet(
  action: string,
  params: Record<string, any>,
  creds: S3Credentials,
  endpoint: string,
) {
  const ep = endpoint.trim() || 'http://localhost:9001'
  const pJson = JSON.stringify(params, null, 2)

  const ts = `import { S3Client, ${action}Command } from "@aws-sdk/client-s3";

const client = new S3Client({
  endpoint: "${ep}",
  region: "us-east-1",
  credentials: {
    accessKeyId: "${creds.accessKeyId}",
    secretAccessKey: "${creds.secretAccessKey}",
  },
  forcePathStyle: true,
});

const command = new ${action}Command(${pJson});
const response = await client.send(command);
console.log(response);`

  const cli = `# AWS CLI v2
export AWS_ACCESS_KEY_ID="${creds.accessKeyId}"
export AWS_SECRET_ACCESS_KEY="${creds.secretAccessKey}"

aws --endpoint-url="${ep}" s3api ${action.toLowerCase().replace('command', '')} \\
  ${params.Bucket ? `--bucket "${params.Bucket}"` : ''} ${params.Key ? `--key "${params.Key}"` : ''}`

  const python = `import boto3

s3 = boto3.client(
    "s3",
    endpoint_url="${ep}",
    aws_access_key_id="${creds.accessKeyId}",
    aws_secret_access_key="${creds.secretAccessKey}",
    region_name="us-east-1",
)

# Execute ${action}
response = s3.${action.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '')}(
    ${Object.entries(params)
      .map(([k, v]) => `${k}="${v}"`)
      .join(', ')}
)
print(response)`

  return { ts, cli, python }
}
