import { Router, Request, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { createUserClient } from '../lib/supabase';
import { sendSuccess, sendNotFound, sendInternalError } from '../utils/response';

const router = Router();

/**
 * GET /notifications
 * 현재 사용자 수신 알림 목록 (RLS: recipient_id = auth.uid() 자동 적용).
 */
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { accessToken } = req as AuthenticatedRequest;
  const supabase = createUserClient(accessToken);

  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    sendInternalError(res, '알림 조회에 실패했습니다.');
    return;
  }

  sendSuccess(res, data ?? []);
});

/**
 * PATCH /notifications/:id/read
 * 알림을 읽음 처리한다 (read_at = now()).
 * RLS UPDATE: recipient_id = auth.uid() 검증.
 */
router.patch('/:id/read', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { userId, accessToken } = req as AuthenticatedRequest;
  const { id } = req.params;
  const supabase = createUserClient(accessToken);

  // 알림 존재 여부 + 수신자 확인
  const { data: existing } = await supabase
    .from('notifications')
    .select('id, recipient_id, read_at')
    .eq('id', id)
    .maybeSingle();

  if (!existing) {
    sendNotFound(res, '알림을 찾을 수 없습니다.');
    return;
  }

  // 이미 읽은 알림은 그대로 반환
  if (existing.read_at) {
    sendSuccess(res, existing);
    return;
  }

  // 읽음 처리 (RLS UPDATE: recipient_id = auth.uid() 검증)
  const { data, error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .eq('recipient_id', userId)
    .select()
    .single();

  if (error || !data) {
    sendInternalError(res, '읽음 처리에 실패했습니다.');
    return;
  }

  sendSuccess(res, data);
});

export default router;
