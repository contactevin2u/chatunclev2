import { Router, Request, Response } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth';
import { uploadImage, uploadAudio, uploadVideo, isCloudinaryConfigured } from '../services/cloudinary';

const router = Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
  },
  fileFilter: (req, file, cb) => {
    // Allow images, videos, and audio
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'video/mp4', 'video/webm', 'video/quicktime',
      'audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/mp4'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`));
    }
  },
});

router.use(authenticate);

// Upload media file
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const { mimetype, buffer, originalname } = req.file;
    let url: string | null = null;

    // Determine type and upload
    if (mimetype.startsWith('image/')) {
      url = await uploadImage(buffer);
    } else if (mimetype.startsWith('video/')) {
      url = await uploadVideo(buffer);
    } else if (mimetype.startsWith('audio/')) {
      url = await uploadAudio(buffer);
    }

    // If Cloudinary is not configured, convert to base64
    if (!url && !isCloudinaryConfigured()) {
      const base64 = buffer.toString('base64');
      url = `data:${mimetype};base64,${base64}`;
    }

    if (!url) {
      res.status(500).json({ error: 'Failed to upload media' });
      return;
    }

    console.log(`[Media] Uploaded ${originalname} (${mimetype})`);

    res.json({
      url,
      mimeType: mimetype,
      filename: originalname,
      size: buffer.length,
    });
  } catch (error: any) {
    console.error('Media upload error:', error);
    res.status(500).json({ error: error.message || 'Failed to upload media' });
  }
});

// Upload voice note (specifically for recorded audio)
router.post('/upload-voice', upload.single('audio'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No audio file uploaded' });
      return;
    }

    const { mimetype, buffer } = req.file;
    let url = await uploadAudio(buffer);

    // If Cloudinary is not configured, convert to base64
    if (!url && !isCloudinaryConfigured()) {
      const base64 = buffer.toString('base64');
      url = `data:${mimetype};base64,${base64}`;
    }

    if (!url) {
      res.status(500).json({ error: 'Failed to upload voice note' });
      return;
    }

    console.log(`[Media] Uploaded voice note (${mimetype})`);

    res.json({
      url,
      mimeType: mimetype,
      duration: req.body.duration || null,
    });
  } catch (error: any) {
    console.error('Voice upload error:', error);
    res.status(500).json({ error: error.message || 'Failed to upload voice note' });
  }
});

export default router;
