import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { createUserClient, supabaseAdmin } from '../lib/supabase';
import { getMyCoupleId } from '../utils/couple';
import {
  sendSuccess,
  sendBadRequest,
  sendForbidden,
  sendNotFound,
  sendError,
  sendInternalError,
} from '../utils/response';

// ────────────────────────────────────────────────────────────
// GET /diaries/:diaryId/comments
// POST /diaries/:diaryId/comments
// ────────────────────────────────────────────────────────────
export const diaryCommentsRouter = Router({ mergeParams: true });

const createCommentSchema = z.object({
  content: z.string().min(1, '댓글 내용을 입력해주세요.').max(1000, '댓글은 1000자 이하여야 합니다.'),
});

/**
 * GET /diaries/:diaryId/comments
 * 일기의 댓글 목록을 반환한다. RLS에서 deleted_at IS NULL 필터 적용.
 */
diaryCommentsRouter.get(
  '/:diaryId/comments',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    const { accessToken } = req as AuthenticatedRequest;
    const { diaryId } = req.params;
    const supabase = createUserClient(accessToken);

    // 일기 존재 여부 확인 (커플 멤버 접근 권한 검증 포함)
    const { data: diary } = await supabase
      .from('diaries')
      .select('id')
      .eq('id', diaryId)
      .maybeSingle();

    if (!diary) {
      sendNotFound(res, '일기를 찾을 수 없습니다.');
      return;
    }

    const { data, error } = await supabase
      .from('comments')
      .select('*')
      .eq('diary_id', diaryId)
      .order('created_at', { ascending: true });

    if (error) {
      sendInternalError(res, '댓글 조회에 실패했습니다.');
      return;
    }

    sendSuccess(res, data ?? []);
  },
);

/**
 * POST /diaries/:diaryId/comments
 * 댓글을 작성한다.
 */
diaryCommentsRouter.post(
  '/:diaryId/comments',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    const { userId, accessToken } = req as AuthenticatedRequest;
    const { diaryId } = req.params;

    const parsed = createCommentSchema.safeParse(req.body);
    if (!parsed.success) {
      sendBadRequest(res, parsed.error.errors[0].message);
      return;
    }

    const coupleId = await getMyCoupleId(userId);
    if (!coupleId) {
      sendError(res, 403, 'NO_COUPLE', '커플 공간에 참여한 후 댓글을 작성할 수 있습니다.');
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

    // 댓글 INSERT (RLS: couple_id = my_couple_id(), author_id = auth.uid() 검증)
    const { data, error } = await supabase
      .from('comments')
      .insert({
        diary_id:  diaryId,
        couple_id: coupleId,
        author_id: userId,
        content:   parsed.data.content,
      })
      .select()
      .single();

    if (error || !data) {
      sendInternalError(res, '댓글 저장에 실패했습니다.');
      return;
    }

    sendSuccess(res, data, 201);
  },
);

// ────────────────────────────────────────────────────────────
// PATCH /comments/:commentId
// DELETE /comments/:commentId
// ────────────────────────────────────────────────────────────
export const commentOpsRouter = Router();

const updateCommentSchema = z.object({
  content: z.string().min(1, '댓글 내용을 입력해주세요.').max(1000),
});

/**
 * PATCH /comments/:commentId
 * 본인 댓글만 수정 가능.
 */
commentOpsRouter.patch(
  '/:commentId',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    const { userId, accessToken } = req as AuthenticatedRequest;
    const { commentId } = req.params;

    const parsed = updateCommentSchema.safeParse(req.body);
    if (!parsed.success) {
      sendBadRequest(res, parsed.error.errors[0].message);
      return;
    }

    const supabase = createUserClient(accessToken);

    // 댓글 존재 여부 + 작성자 확인
    const { data: existing } = await supabase
      .from('comments')
      .select('id, author_id')
      .eq('id', commentId)
      .maybeSingle();

    if (!existing) {
      sendNotFound(res, '댓글을 찾을 수 없습니다.');
      return;
    }

    if (existing.author_id !== userId) {
      sendForbidden(res, '본인이 작성한 댓글만 수정할 수 있습니다.');
      return;
    }

    // UPDATE (RLS: author_id = auth.uid() 검증)
    const { data, error } = await supabase
      .from('comments')
      .update({ content: parsed.data.content })
      .eq('id', commentId)
      .select()
      .single();

    if (error || !data) {
      sendInternalError(res, '댓글 수정에 실패했습니다.');
      return;
    }

    sendSuccess(res, data);
  },
);

/**
 * DELETE /comments/:commentId
 * soft delete — deleted_at 을 현재 시간으로 설정.
 * 본인 댓글만 삭제 가능.
 *
 * soft delete에 service role을 사용하는 이유:
 * comments SELECT RLS 에 `deleted_at IS NULL` 조건이 있어서,
 * user client로 UPDATE(soft delete) 시 PostgREST가 업데이트 후 행을
 * SELECT RLS로 재검증하는 과정에서 충돌이 발생해 500 에러가 생긴다.
 * 소유권 확인은 백엔드에서 직접 처리하고, UPDATE만 service role로 우회한다.
 */
commentOpsRouter.delete(
  '/:commentId',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    const { userId, accessToken } = req as AuthenticatedRequest;
    const { commentId } = req.params;
    const supabase = createUserClient(accessToken);

    // 댓글 존재 여부 + 작성자 확인 (user client — RLS로 커플 공간 및 삭제 여부 검증)
    const { data: existing, error: selectError } = await supabase
      .from('comments')
      .select('id, author_id')
      .eq('id', commentId)
      .maybeSingle();

    if (selectError) {
      console.error('[COMMENT DELETE] select error:', selectError);
      sendInternalError(res, '댓글 조회에 실패했습니다.');
      return;
    }

    if (!existing) {
      sendNotFound(res, '댓글을 찾을 수 없습니다.');
      return;
    }

    if (existing.author_id !== userId) {
      sendForbidden(res, '본인이 작성한 댓글만 삭제할 수 있습니다.');
      return;
    }

    // soft delete — service role 사용 (SELECT RLS와 UPDATE 충돌 방지)
    // author_id 조건을 추가해 이중으로 소유권 검증
    const { error: updateError } = await supabaseAdmin
      .from('comments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', commentId)
      .eq('author_id', userId);

    if (updateError) {
      console.error('[COMMENT DELETE] update error:', updateError);
      sendInternalError(res, '댓글 삭제에 실패했습니다.');
      return;
    }

    sendSuccess(res, { message: '댓글이 삭제되었습니다.' });
  },
);
