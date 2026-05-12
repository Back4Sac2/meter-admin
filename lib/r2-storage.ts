import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME!;

export async function uploadToStorage(
  buffer: Buffer,
  path: string,
  mimeType: string,
): Promise<string> {
  await client.send(
    new PutObjectCommand({ Bucket: BUCKET, Key: path, Body: buffer, ContentType: mimeType }),
  );
  return path;
}

export async function deleteFromStorage(path: string): Promise<void> {
  await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: path }));
}

export async function getUploadPresignedUrl(path: string, contentType: string): Promise<string> {
  const command = new PutObjectCommand({ Bucket: BUCKET, Key: path, ContentType: contentType });
  return getSignedUrl(client, command, { expiresIn: 300 });
}
