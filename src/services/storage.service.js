import cloudinary, { isCloudinaryConfigured } from '../config/cloudinary.js';
import env from '../config/env.js';
import { ApiError } from '../utils/asyncHandler.js';

// Upload a single in-memory file buffer to Cloudinary as a private (authenticated) raw asset.
export function uploadBuffer(file, { folder = env.cloudinary.folder } = {}) {
  if (!isCloudinaryConfigured()) {
    return Promise.reject(new ApiError(503, 'Cloudinary is not configured (set CLOUDINARY_* env vars)'));
  }
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'raw', type: 'authenticated', use_filename: true, unique_filename: true },
      (err, result) => {
        if (err) return reject(new ApiError(502, `Cloudinary upload failed: ${err.message}`));
        resolve(result);
      }
    );
    stream.end(file.buffer);
  });
}

// Short-lived signed URL for a private asset (default 5 min).
export function signedUrl(publicId, { resourceType = 'raw', expiresInSec = 300 } = {}) {
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSec;
  return cloudinary.utils.private_download_url(publicId, '', {
    resource_type: resourceType,
    type: 'authenticated',
    expires_at: expiresAt,
  });
}

export async function destroyAsset(publicId, resourceType = 'raw') {
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType, type: 'authenticated' });
  } catch (err) {
    console.error('[storage] destroy failed', publicId, err.message);
  }
}
