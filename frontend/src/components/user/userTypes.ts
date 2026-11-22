export interface AccessKey {
  accessKeyId?: string
  access_key_id?: string
  secretAccessKey?: string
  secret_access_key?: string
  secretKey?: string
  createdAt?: string
  created_at?: string
}

export interface Policy {
  name: string
  version?: string
  statement: any[]
}

export interface IamUser {
  username: string
  policies?: Policy[]
  accessKeys?: AccessKey[]
  access_keys?: AccessKey[]
  createdAt?: string
  created_at?: string
}
