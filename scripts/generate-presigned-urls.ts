#!/usr/bin/env node
import "dotenv/config";
import {
  S3Client,
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

interface PresignedUrlsOutput {
  getUrl: string;
  putUrl: string;
  etag: string | null;
}

async function generatePresignedUrls(): Promise<void> {
  const bucketName = process.env.BUCKET_NAME;
  const objectKey = process.env.OBJECT_KEY || "vault.dat";
  const region = process.env.AWS_REGION || "us-east-1";

  if (!bucketName) {
    console.error("Error: BUCKET_NAME environment variable is required");
    process.exit(1);
  }

  const s3Client = new S3Client({ region });

  // Fetch current object ETag if it exists
  let etag: string | null = null;
  try {
    const headCommand = new HeadObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
    });
    const headResponse = await s3Client.send(headCommand);
    etag = headResponse.ETag?.replace(/"/g, "") || null;
  } catch (error: any) {
    // Object doesn't exist yet, which is fine
    if (error.name !== "NotFound") {
      console.error("Error fetching object metadata:", error);
      process.exit(1);
    }
  }

  // Generate expiration time (12 minutes = 720 seconds, between 10-15 minutes)
  const expirationSeconds = 720;

  // Generate GET pre-signed URL
  const getCommand = new GetObjectCommand({
    Bucket: bucketName,
    Key: objectKey,
  });
  const getUrl = await getSignedUrl(s3Client, getCommand, {
    expiresIn: expirationSeconds,
  });

  // Generate PUT pre-signed URL
  const putCommand = new PutObjectCommand({
    Bucket: bucketName,
    Key: objectKey,
  });
  const putUrl = await getSignedUrl(s3Client, putCommand, {
    expiresIn: expirationSeconds,
  });

  const output: PresignedUrlsOutput = {
    getUrl,
    putUrl,
    etag,
  };

  console.log(JSON.stringify(output, null, 2));
}

generatePresignedUrls().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
