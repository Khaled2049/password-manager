import {
  S3Client,
  ListObjectsV2Command,
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
});
const bucketName = process.env.BUCKET_NAME!;
const VAULT_PREFIX = "vaults/";
const URL_EXPIRATION = 720; // 12 minutes
const MAX_VAULTS = 5;

interface ApiGatewayEvent {
  httpMethod?: string;
  resource?: string;
  pathParameters?: { key?: string };
  body?: string;
  headers?: { origin?: string; Origin?: string };
}

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const validateOrigin = (origin: string | undefined): string | null => {
  if (!origin) return null;
  return allowedOrigins.includes(origin) ? origin : null;
};

const corsHeaders = (origin: string | null) => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    Vary: "Origin",
  };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
};

const response = (statusCode: number, body: any, origin: string | null) => ({
  statusCode,
  headers: corsHeaders(origin),
  body: JSON.stringify(body),
});

const sanitizeVaultKey = (key: string): string => {
  const normalized = key.replace(/\.\./g, "").replace(/^\/+/, "");
  const prefixed = normalized.startsWith(VAULT_PREFIX)
    ? normalized
    : `${VAULT_PREFIX}${normalized}`;
  return prefixed.endsWith(".dat") ? prefixed : `${prefixed}.dat`;
};

const getOrigin = (event: ApiGatewayEvent): string | null =>
  validateOrigin(event.headers?.origin || event.headers?.Origin);

async function listVaults(origin: string | null) {
  const { Contents } = await s3Client.send(
    new ListObjectsV2Command({ Bucket: bucketName, Prefix: VAULT_PREFIX }),
  );

  const vaults =
    Contents?.map((obj) => ({
      key: obj.Key!,
      name: obj.Key!.replace(VAULT_PREFIX, "").replace(/\.dat$/, ""),
      lastModified: obj.LastModified?.toISOString(),
      size: obj.Size,
    })) || [];

  return response(200, { vaults }, origin);
}

async function getVaultUrls(event: ApiGatewayEvent, origin: string | null) {
  const rawKey = event.pathParameters?.key
    ? decodeURIComponent(event.pathParameters.key)
    : JSON.parse(event.body || "{}").key ||
      JSON.parse(event.body || "{}").vaultKey;

  if (!rawKey) {
    throw new Error("Vault key not provided");
  }

  const vaultKey = sanitizeVaultKey(rawKey);

  // Get ETag if object exists
  let etag: string | null = null;
  try {
    const { ETag } = await s3Client.send(
      new HeadObjectCommand({ Bucket: bucketName, Key: vaultKey }),
    );
    etag = ETag?.replace(/"/g, "") || null;
  } catch (error: any) {
    if (error.name !== "NotFound") throw error;
  }

  // Block new vault creation if at the limit
  if (!etag) {
    const { KeyCount } = await s3Client.send(
      new ListObjectsV2Command({ Bucket: bucketName, Prefix: VAULT_PREFIX }),
    );
    if ((KeyCount ?? 0) >= MAX_VAULTS) {
      return response(
        403,
        {
          error: `Vault limit reached (${MAX_VAULTS}). Delete a vault before creating a new one.`,
        },
        origin,
      );
    }
  }

  // Generate pre-signed URLs
  const [getUrl, putUrl] = await Promise.all([
    getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: bucketName, Key: vaultKey }),
      { expiresIn: URL_EXPIRATION },
    ),
    getSignedUrl(
      s3Client,
      new PutObjectCommand({ Bucket: bucketName, Key: vaultKey }),
      { expiresIn: URL_EXPIRATION },
    ),
  ]);

  return response(200, { getUrl, putUrl, etag, vaultKey }, origin);
}

export async function handler(event: ApiGatewayEvent) {
  const origin = getOrigin(event);

  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return response(200, {}, origin);
  }

  try {
    if (!bucketName) {
      throw new Error("BUCKET_NAME environment variable is not set");
    }

    const { resource = "", httpMethod = "" } = event;

    if (resource === "/vaults" && httpMethod === "GET") {
      return await listVaults(origin);
    }

    if (resource === "/vaults/{key}" && httpMethod === "POST") {
      return await getVaultUrls(event, origin);
    }

    return response(
      404,
      { error: "Not found", resource, method: httpMethod },
      origin,
    );
  } catch (error: any) {
    console.error("Handler error:", error);
    return response(
      500,
      { error: error.message || "Internal server error" },
      origin,
    );
  }
}
