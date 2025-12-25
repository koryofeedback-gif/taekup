import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({
  endpoint: `https://${process.env.IDRIVE_E2_ENDPOINT}`,
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.IDRIVE_E2_ACCESS_KEY || '',
    secretAccessKey: process.env.IDRIVE_E2_SECRET_KEY || '',
  },
  forcePathStyle: true,
});

const BUCKET_NAME = process.env.IDRIVE_E2_BUCKET_NAME || '';

export interface PresignedUploadResult {
  uploadUrl: string;
  key: string;
  publicUrl: string;
}

export interface PresignedDownloadResult {
  downloadUrl: string;
}

export async function getPresignedUploadUrl(
  studentId: string,
  challengeId: string,
  filename: string,
  contentType: string = 'video/mp4'
): Promise<PresignedUploadResult> {
  const timestamp = Date.now();
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
  const key = `challenge-videos/${studentId}/${challengeId}/${timestamp}-${sanitizedFilename}`;
  
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });
  
  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
  const publicUrl = `https://${BUCKET_NAME}.${process.env.IDRIVE_E2_ENDPOINT}/${key}`;
  
  return {
    uploadUrl,
    key,
    publicUrl,
  };
}

export async function getPresignedDownloadUrl(key: string): Promise<PresignedDownloadResult> {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });
  
  const downloadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
  
  return { downloadUrl };
}

export async function deleteVideo(key: string): Promise<boolean> {
  try {
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });
    
    await s3Client.send(command);
    return true;
  } catch (error) {
    console.error('Error deleting video:', error);
    return false;
  }
}

export async function checkVideoExists(key: string): Promise<boolean> {
  try {
    const command = new HeadObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });
    
    await s3Client.send(command);
    return true;
  } catch (error) {
    return false;
  }
}

export async function getObject(key: string) {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });
    
    return await s3Client.send(command);
  } catch (error) {
    console.error('Error getting object:', error);
    return null;
  }
}

export default {
  getPresignedUploadUrl,
  getPresignedDownloadUrl,
  deleteVideo,
  checkVideoExists,
  getObject,
};
