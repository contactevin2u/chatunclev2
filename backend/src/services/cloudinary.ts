import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary from CLOUDINARY_URL environment variable
// Format: cloudinary://<api_key>:<api_secret>@<cloud_name>
// The SDK automatically reads CLOUDINARY_URL if set

const CLOUDINARY_URL = process.env.CLOUDINARY_URL;

if (CLOUDINARY_URL) {
  // Parse the URL format: cloudinary://api_key:api_secret@cloud_name
  const match = CLOUDINARY_URL.match(/cloudinary:\/\/(\d+):([^@]+)@(.+)/);
  if (match) {
    cloudinary.config({
      cloud_name: match[3],
      api_key: match[1],
      api_secret: match[2],
      secure: true,
    });
    console.log(`[Cloudinary] Configured with cloud: ${match[3]}`);
  } else {
    console.error('[Cloudinary] Invalid CLOUDINARY_URL format');
  }
} else {
  console.log('[Cloudinary] Not configured - media will be stored as Base64');
}

/**
 * Check if Cloudinary is configured
 */
export function isCloudinaryConfigured(): boolean {
  return !!CLOUDINARY_URL;
}

/**
 * Upload media buffer to Cloudinary
 * Returns the secure URL of the uploaded file
 */
export async function uploadMedia(
  buffer: Buffer,
  options: {
    folder?: string;
    resourceType?: 'image' | 'video' | 'raw' | 'auto';
    format?: string;
    publicId?: string;
  } = {}
): Promise<string | null> {
  if (!isCloudinaryConfigured()) {
    return null;
  }

  try {
    const result = await new Promise<any>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: options.folder || 'chatuncle',
          resource_type: options.resourceType || 'auto',
          format: options.format,
          public_id: options.publicId,
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );

      uploadStream.end(buffer);
    });

    console.log(`[Cloudinary] Uploaded: ${result.secure_url}`);
    return result.secure_url;
  } catch (error) {
    console.error('[Cloudinary] Upload failed:', error);
    return null;
  }
}

/**
 * Upload image to Cloudinary with optimization
 */
export async function uploadImage(buffer: Buffer, messageId?: string): Promise<string | null> {
  return uploadMedia(buffer, {
    folder: 'chatuncle/images',
    resourceType: 'image',
    publicId: messageId ? `img_${messageId}` : undefined,
  });
}

/**
 * Upload sticker to Cloudinary
 */
export async function uploadSticker(buffer: Buffer, messageId?: string): Promise<string | null> {
  return uploadMedia(buffer, {
    folder: 'chatuncle/stickers',
    resourceType: 'image',
    publicId: messageId ? `sticker_${messageId}` : undefined,
  });
}

/**
 * Upload audio/voice note to Cloudinary
 * Converts to MP3 for browser compatibility (Safari doesn't support OGG Opus)
 */
export async function uploadAudio(buffer: Buffer, messageId?: string): Promise<string | null> {
  return uploadMedia(buffer, {
    folder: 'chatuncle/audio',
    resourceType: 'video', // Cloudinary uses 'video' for audio files
    format: 'mp3', // Convert to MP3 for universal browser support
    publicId: messageId ? `audio_${messageId}` : undefined,
  });
}

/**
 * Upload video to Cloudinary
 */
export async function uploadVideo(buffer: Buffer, messageId?: string): Promise<string | null> {
  return uploadMedia(buffer, {
    folder: 'chatuncle/videos',
    resourceType: 'video',
    publicId: messageId ? `video_${messageId}` : undefined,
  });
}

/**
 * Upload document to Cloudinary
 * For documents, we use the original filename to preserve it in the URL
 */
export async function uploadDocument(buffer: Buffer, originalFilename?: string, messageId?: string): Promise<string | null> {
  // Use original filename for the public_id so the download has the correct name
  // Sanitize filename to remove special characters that might cause issues
  const sanitizedName = originalFilename
    ? originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_')
    : `doc_${messageId || Date.now()}`;

  return uploadMedia(buffer, {
    folder: 'chatuncle/documents',
    resourceType: 'raw',
    publicId: sanitizedName,
  });
}

export default cloudinary;
