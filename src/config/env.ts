import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  SUPABASE_URL:              z.string().url(),
  SUPABASE_ANON_KEY:         z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  CLOUDINARY_CLOUD_NAME:    z.string().min(1),
  CLOUDINARY_API_KEY:       z.string().min(1),
  CLOUDINARY_API_SECRET:    z.string().min(1),
  CLOUDINARY_UPLOAD_FOLDER: z.string().default('diary'),

  FRONTEND_ORIGIN: z.string().default('http://localhost:3000'),
  PORT:            z.coerce.number().default(4000),
  NODE_ENV:        z.enum(['development', 'production', 'test']).default('development'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('[ENV] 환경 변수 설정 오류:');
  console.error(parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
