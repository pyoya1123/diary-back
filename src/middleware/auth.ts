import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../lib/supabase';
import { sendUnauthorized } from '../utils/response';

export interface AuthenticatedRequest extends Request {
  userId: string;
  accessToken: string;
}

/**
 * Authorization: Bearer {access_token} 헤더를 검증하고
 * req.userId, req.accessToken 을 설정한다.
 * 토큰이 없거나 유효하지 않으면 401을 반환한다.
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    sendUnauthorized(res);
    return;
  }

  const token = authHeader.slice(7);

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    sendUnauthorized(res);
    return;
  }

  (req as AuthenticatedRequest).userId = user.id;
  (req as AuthenticatedRequest).accessToken = token;
  next();
}
