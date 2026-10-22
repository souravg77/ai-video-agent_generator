import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { config } from "../config.js";

export function storageConfigured(): boolean {
  return Boolean(config.R2_ACCOUNT_ID && config.R2_ACCESS_KEY_ID && config.R2_SECRET_ACCESS_KEY && config.R2_BUCKET);
}

// Uploads a file to Cloudflare R2 and returns its public URL (or the key if no public base URL is set).
export async function uploadFile(filePath: string, key: string, contentType: string): Promise<string> {
  if (!storageConfigured()) throw new Error("R2 storage is not configured in .env.");
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.R2_ACCESS_KEY_ID!, secretAccessKey: config.R2_SECRET_ACCESS_KEY! },
  });
  const { size } = await stat(filePath);
  await client.send(
    new PutObjectCommand({ Bucket: config.R2_BUCKET, Key: key, Body: createReadStream(filePath), ContentLength: size, ContentType: contentType }),
  );
  return config.R2_PUBLIC_BASE_URL ? `${config.R2_PUBLIC_BASE_URL.replace(/\/$/, "")}/${key}` : key;
}
