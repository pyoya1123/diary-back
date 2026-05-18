import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { getMyCoupleId } from '../utils/couple';
import { env } from '../config/env';
import { sendSuccess, sendError } from '../utils/response';

const router = Router();

/**
 * Cloudinary signed upload 파라미터 서명.
 * HMAC 이 아닌 SHA-1(sorted_params + api_secret) 방식을 사용한다.
 * Cloudinary API secret은 이 함수 내부에서만 사용되고 절대 응답에 포함하지 않는다.
 */
function buildCloudinarySignature(
  params: Record<string, string | number>,
  apiSecret: string,
): string {
  const paramString = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');

  return crypto.createHash('sha1').update(paramString + apiSecret).digest('hex');
}

/**
 * POST /uploads/cloudinary-signature
 *
 * 로그인한 사용자에게 Cloudinary signed upload에 필요한 서명 정보를 반환한다.
 * 응답에는 signature, timestamp, apiKey, cloudName, folder 만 포함한다.
 * Cloudinary API secret은 절대 응답에 포함하지 않는다.
 *
 * 업로드 제한 (프론트엔드에서 준수해야 할 정책):
 *   - 허용 확장자: jpg, jpeg, png, webp
 *   - 최대 파일 크기: 10MB
 *   - 일기당 최대 3장 (백엔드 POST /diaries 에서 검증)
 *
 * 업로드 폴더 구조: {CLOUDINARY_UPLOAD_FOLDER}/{coupleId}
 * coupleId 가 없는 경우 {CLOUDINARY_UPLOAD_FOLDER} 루트에 저장.
 */
router.post('/cloudinary-signature', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;

  // 커플 공간이 있으면 diary/{coupleId}, 없으면 diary/{userId} 폴더 사용
  const coupleId = await getMyCoupleId(userId);
  const folder = coupleId
    ? `${env.CLOUDINARY_UPLOAD_FOLDER}/${coupleId}`
    : `${env.CLOUDINARY_UPLOAD_FOLDER}/${userId}`;

  const timestamp = Math.floor(Date.now() / 1000);

  // 서명 대상 파라미터 — 실제 업로드 요청에 포함되는 파라미터만 서명해야 한다.
  // allowed_formats 등 추가 제약을 넣으면 프론트엔드 업로드 요청에도 동일하게 포함해야 함.
  // 프론트엔드가 folder + timestamp 만 보내는 경우 이 두 값만 서명한다.
  const paramsToSign: Record<string, string | number> = {
    folder,
    timestamp,
  };

  // API secret은 서명 계산에만 사용하고 절대 응답에 포함하지 않는다.
  const signature = buildCloudinarySignature(paramsToSign, env.CLOUDINARY_API_SECRET);

  sendSuccess(res, {
    signature,
    timestamp,
    apiKey:    env.CLOUDINARY_API_KEY,
    cloudName: env.CLOUDINARY_CLOUD_NAME,
    folder,
  });
});

export default router;
