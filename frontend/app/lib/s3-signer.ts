export class S3Signer {
    private accessKeyId: string;
    private secretAccessKey: string;
    private region: string;
    private service: string;

    constructor(accessKeyId: string, secretAccessKey: string, region: string = 'us-east-1', service: string = 's3') {
        this.accessKeyId = accessKeyId;
        this.secretAccessKey = secretAccessKey;
        this.region = region;
        this.service = service;
    }

    private async hmac(key: ArrayBuffer | string, data: string): Promise<ArrayBuffer> {
        const encoder = new TextEncoder();
        const keyData = typeof key === 'string' ? encoder.encode(key) : key;
        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            keyData,
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );
        return await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
    }

    private async hash(data: string | ArrayBuffer): Promise<string> {
        const encoder = new TextEncoder();
        const dataBuffer = typeof data === 'string' ? encoder.encode(data) : data;
        const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
        return Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    private async getSignatureKey(dateStamp: string): Promise<ArrayBuffer> {
        const kDate = await this.hmac('AWS4' + this.secretAccessKey, dateStamp);
        const kRegion = await this.hmac(kDate, this.region);
        const kService = await this.hmac(kRegion, this.service);
        const kSigning = await this.hmac(kService, 'aws4_request');
        return kSigning;
    }

    async buildCanonicalRequest(
        method: string,
        path: string,
        query: Record<string, string>,
        headers: Record<string, string>,
        signedHeaders: string[],
        payloadHash: string
    ): Promise<string> {
        const canonicalUri = path || '/';

        const canonicalQuery = Object.keys(query)
            .sort()
            .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(query[k]!)}`)
            .join('&');

        const canonicalHeaders = signedHeaders
            .map(h => `${h.toLowerCase()}:${(headers[h] || '').trim()}\n`)
            .join('');

        const signedHeadersStr = signedHeaders.map(h => h.toLowerCase()).join(';');

        return `${method}\n${canonicalUri}\n${canonicalQuery}\n${canonicalHeaders}\n${signedHeadersStr}\n${payloadHash}`;
    }

    async sign(method: string, url: string, headers: Record<string, string>, payload?: any): Promise<Record<string, string>> {
        const parsedUrl = new URL(url);
        const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
        const dateStamp = amzDate.slice(0, 8);

        headers['x-amz-date'] = amzDate;
        headers['host'] = parsedUrl.host;

        let payloadHash = 'UNSIGNED-PAYLOAD';
        if (payload) {
            if (payload instanceof Blob || payload instanceof File) {
                // Calculate actual SHA256 hash for file uploads
                const arrayBuffer = await payload.arrayBuffer();
                payloadHash = await this.hash(arrayBuffer);
            } else if (payload instanceof ArrayBuffer) {
                payloadHash = await this.hash(payload);
            } else if (typeof payload === 'string') {
                payloadHash = await this.hash(payload);
            }
        }
        headers['x-amz-content-sha256'] = payloadHash;

        const signedHeaders = Object.keys(headers).sort();
        const query: Record<string, string> = {};
        parsedUrl.searchParams.forEach((v, k) => { query[k] = v; });

        const canonicalRequest = await this.buildCanonicalRequest(
            method,
            parsedUrl.pathname,
            query,
            headers,
            signedHeaders,
            payloadHash
        );

        const credentialScope = `${dateStamp}/${this.region}/${this.service}/aws4_request`;
        const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${await this.hash(canonicalRequest)}`;

        const signingKey = await this.getSignatureKey(dateStamp);
        const signature = Array.from(new Uint8Array(await this.hmac(signingKey, stringToSign)))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');

        const authHeader = `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders.map(h => h.toLowerCase()).join(';')}, Signature=${signature}`;

        return {
            ...headers,
            'Authorization': authHeader
        };
    }
}
