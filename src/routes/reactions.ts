import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { createUserClient } from '../lib/supabase';
import { getMyCoupleId } from '../utils/couple';
import {
  sendSuccess,
  sendBadRequest,
  sendNotFound,
  sendError,
  sendInternalError,
} from '../utils/response';

export const reactionsRouter = Router({ mergeParams: true });

const ALLOWED_EMOJIS = ['❤️', '🥰', '😂', '😢', '👏'] as const;

const reactionSchema = z.object({
  emoji: z.enum(ALLOWED_EMOJIS, {
    errorMap: () => ({ message: `허용된 이모지가 아닙니다. (${ALLOWED_EMOJIS.join(', ')})` }),
  }),
});

/**
 * PUT /diaries/:diaryId/reaction
 *
 * 반응이 없으면 생성, 다른 이모지면 수정, 같은 이모지면 취소(삭제).
 * 일기당 사용자 1개 반응 제한 (DB UNIQUE 제약).
 */
reactionsRouter.put(
  '/:diaryId/reaction',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    const { userId, accessToken } = req as AuthenticatedRequest;
    const { diaryId } = req.params;

    const parsed = reactionSchema.safeParse(req.body);
    if (!parsed.success) {
      sendBadRequest(res, parsed.error.errors[0].message);
      return;
    }

    const { emoji } = parsed.data;

    const coupleId = await getMyCoupleId(userId);
    if (!coupleId) {
      sendError(res, 403, 'NO_COUPLE', '커플 공간에 참여한 후 반응을 남길 수 있습니다.');
      return;
    }

    const supabase = createUserClient(accessToken);

    // 일기 존재 여부 확인
    const { data: diary } = await supabase
      .from('diaries')
      .select('id')
      .eq('id', diaryId)
      .maybeSingle();

    if (!diary) {
      sendNotFound(res, '일기를 찾을 수 없습니다.');
      return;
    }

    // 기존 반응 조회
    const { data: existing } = await supabase
      .from('diary_reactions')
      .select('id, emoji')
      .eq('diary_id', diaryId)
      .eq('user_id', userId)
      .maybeSingle();

    // 같은 이모지 재요청 → 반응 취소 (DELETE)
    if (existing && existing.emoji === emoji) {
      const { error } = await supabase
        .from('diary_reactions')
        .delete()
        .eq('id', existing.id);

      if (error) {
        sendInternalError(res, '반응 취소에 실패했습니다.');
        return;
      }

      sendSuccess(res, { cancelled: true, emoji });
      return;
    }

    // 반응 없음 → INSERT
    if (!existing) {
      const { data, error } = await supabase
        .from('diary_reactions')
        .insert({
          diary_id:  diaryId,
          couple_id: coupleId,
          user_id:   userId,
          emoji,
        })
        .select()
        .single();

      if (error || !data) {
        sendInternalError(res, '반응 저장에 실패했습니다.');
        return;
      }

      sendSuccess(res, data, 201);
      return;
    }

    // 다른 이모지 → UPDATE (RLS: user_id = auth.uid() 검증)
    const { data, error } = await supabase
      .from('diary_reactions')
      .update({ emoji })
      .eq('id', existing.id)
      .select()
      .single();

    if (error || !data) {
      sendInternalError(res, '반응 변경에 실패했습니다.');
      return;
    }

    sendSuccess(res, data);
  },
);

/**
 * DELETE /diaries/:diaryId/reaction
 * 본인의 반응을 명시적으로 취소한다.
 */
reactionsRouter.delete(
  '/:diaryId/reaction',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    const { userId, accessToken } = req as AuthenticatedRequest;
    const { diaryId } = req.params;
    const supabase = createUserClient(accessToken);

    const { data: existing } = await supabase
      .from('diary_reactions')
      .select('id')
      .eq('diary_id', diaryId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!existing) {
      sendNotFound(res, '취소할 반응이 없습니다.');
      return;
    }

    const { error } = await supabase
      .from('diary_reactions')
      .delete()
      .eq('id', existing.id);

    if (error) {
      sendInternalError(res, '반응 취소에 실패했습니다.');
      return;
    }

    sendSuccess(res, { message: '반응이 취소되었습니다.' });
  },
);
