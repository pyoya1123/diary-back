import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { createUserClient } from '../lib/supabase';
import {
  sendSuccess,
  sendBadRequest,
  sendNotFound,
  sendInternalError,
} from '../utils/response';

const router = Router();

const updateMeSchema = z.object({
  display_name: z.string().min(1, '이름은 1자 이상이어야 합니다.').max(50, '이름은 50자 이하여야 합니다.').optional(),
  avatar_url:   z.string().url('올바른 URL 형식이 아닙니다.').nullable().optional(),
});

/**
 * GET /me
 * 현재 로그인한 사용자의 프로필을 반환한다.
 */
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { userId, accessToken } = req as AuthenticatedRequest;
  const supabase = createUserClient(accessToken);

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error || !data) {
    sendNotFound(res, '프로필을 찾을 수 없습니다.');
    return;
  }

  sendSuccess(res, data);
});

/**
 * PATCH /me
 * 현재 로그인한 사용자의 프로필을 수정한다.
 */
router.patch('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { userId, accessToken } = req as AuthenticatedRequest;

  const parsed = updateMeSchema.safeParse(req.body);
  if (!parsed.success) {
    sendBadRequest(res, parsed.error.errors[0].message);
    return;
  }

  if (Object.keys(parsed.data).length === 0) {
    sendBadRequest(res, '수정할 항목을 하나 이상 입력해주세요.');
    return;
  }

  const supabase = createUserClient(accessToken);

  const { data, error } = await supabase
    .from('profiles')
    .update(parsed.data)
    .eq('id', userId)
    .select()
    .single();

  if (error) {
    sendInternalError(res, '프로필 수정에 실패했습니다.');
    return;
  }

  if (!data) {
    sendNotFound(res, '프로필을 찾을 수 없습니다.');
    return;
  }

  sendSuccess(res, data);
});

export default router;
