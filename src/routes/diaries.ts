import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { createUserClient, supabaseAdmin } from '../lib/supabase';
import { getMyCoupleId, getPartnerId } from '../utils/couple';
import {
  sendSuccess,
  sendBadRequest,
  sendForbidden,
  sendNotFound,
  sendError,
  sendInternalError,
} from '../utils/response';

const router = Router();

// ────────────────────────────────────────────────────────────
// 공통 스키마
// ────────────────────────────────────────────────────────────

const MOOD_VALUES = ['happy', 'love', 'calm', 'sad', 'tired'] as const;

const imageSchema = z.object({
  cloudinary_public_id: z.string().min(1, 'public_id는 필수입니다.'),
  secure_url:           z.string().url('올바른 이미지 URL이 아닙니다.'),
  sort_order:           z.number().int().min(0).optional(),
});

const createDiarySchema = z.object({
  title:      z.string().min(1, '제목을 입력해주세요.').max(200, '제목은 200자 이하여야 합니다.'),
  content:    z.string().min(1, '내용을 입력해주세요.'),
  diary_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, '날짜 형식은 YYYY-MM-DD이어야 합니다.'),
  mood:  z.enum(MOOD_VALUES, { errorMap: () => ({ message: '올바른 기분 값이 아닙니다.' }) }),
  tags:  z.array(z.string()).default([]),
  images: z.array(imageSchema).max(3, '사진은 최대 3장까지 첨부할 수 있습니다.').optional(),
});

const updateDiarySchema = z.object({
  title:      z.string().min(1).max(200).optional(),
  content:    z.string().min(1).optional(),
  diary_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  mood:       z.enum(MOOD_VALUES).optional(),
  tags:       z.array(z.string()).optional(),
  images:     z.array(imageSchema).max(3, '사진은 최대 3장까지 첨부할 수 있습니다.').optional(),
});

const uuidSchema = z.string().uuid();

// ────────────────────────────────────────────────────────────
// 유틸
// ────────────────────────────────────────────────────────────

/** diary_date 가 오늘 이후(미래)인지 확인한다. */
function isFutureDate(dateStr: string): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return dateStr > today;
}

type DiaryReadRow = {
  diary_id: string;
  read_at: string;
};

type SupabaseErrorLike = {
  code?: string;
  message?: string;
};

let warnedMissingDiaryReadsTable = false;

function parseIdList(value: unknown): { ids: string[]; error?: string } {
  if (typeof value !== 'string') {
    return { ids: [], error: 'ids query parameter is required.' };
  }

  const ids = [
    ...new Set(value.split(',').map((id) => id.trim()).filter(Boolean)),
  ];

  if (ids.length === 0) {
    return { ids: [], error: 'ids query parameter is required.' };
  }

  if (ids.some((id) => !uuidSchema.safeParse(id).success)) {
    return { ids: [], error: 'ids must be comma-separated UUIDs.' };
  }

  return { ids };
}

async function fetchMyReadMap(
  supabase: ReturnType<typeof createUserClient>,
  userId: string,
  diaryIds: string[],
): Promise<{ readMap: Map<string, string>; error: unknown }> {
  const readMap = new Map<string, string>();

  if (diaryIds.length === 0) {
    return { readMap, error: null };
  }

  const { data, error } = await supabase
    .from('diary_reads')
    .select('diary_id, read_at')
    .eq('user_id', userId)
    .in('diary_id', diaryIds);

  if (error) {
    if (isDiaryReadsUnavailableError(error)) {
      warnMissingDiaryReadsTable(error);
      return { readMap, error: null };
    }

    return { readMap, error };
  }

  for (const row of (data ?? []) as DiaryReadRow[]) {
    readMap.set(row.diary_id, row.read_at);
  }

  return { readMap, error: null };
}

// ────────────────────────────────────────────────────────────
function isDiaryReadsUnavailableError(error: SupabaseErrorLike): boolean {
  return (
    error.code === 'PGRST205' ||
    error.code === '42P01' ||
    Boolean(error.message?.includes("Could not find the table 'public.diary_reads'"))
  );
}

function warnMissingDiaryReadsTable(error: SupabaseErrorLike) {
  if (warnedMissingDiaryReadsTable) {
    return;
  }

  warnedMissingDiaryReadsTable = true;
  console.warn(
    '[DIARY READ] diary_reads table is unavailable. Apply supabase/migrations/20260611000000_add_diary_reads.sql and reload the Supabase schema cache.',
    error,
  );
}

// GET /diaries
// 커플 공간의 일기 목록 (이미지 포함, 최신순)
// ────────────────────────────────────────────────────────────
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { userId, accessToken } = req as AuthenticatedRequest;
  const supabase = createUserClient(accessToken);

  const { data, error } = await supabase
    .from('diaries')
    .select('*, diary_images(*)')
    .order('diary_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    sendInternalError(res, '일기 목록 조회에 실패했습니다.');
    return;
  }

  const diaries = data ?? [];
  const { readMap, error: readsError } = await fetchMyReadMap(
    supabase,
    userId,
    diaries.map((diary) => diary.id as string),
  );

  if (readsError) {
    sendInternalError(res, 'Failed to fetch diary read status.');
    return;
  }

  sendSuccess(
    res,
    diaries.map((diary) => ({
      ...diary,
      my_read_at: readMap.get(diary.id as string) ?? null,
    })),
  );
});

// ────────────────────────────────────────────────────────────
// POST /diaries
// 일기 생성 + 이미지 저장 + 파트너 알림 생성
// ────────────────────────────────────────────────────────────
router.post('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { userId, accessToken } = req as AuthenticatedRequest;

  const parsed = createDiarySchema.safeParse(req.body);
  if (!parsed.success) {
    sendBadRequest(res, parsed.error.errors[0].message);
    return;
  }

  const { title, content, diary_date, mood, tags, images } = parsed.data;

  // 미래 날짜 차단
  if (isFutureDate(diary_date)) {
    sendBadRequest(res, '미래 날짜의 일기는 작성할 수 없습니다.');
    return;
  }

  // couple_id 확인 (service role — 인증 이후 가장 먼저 조회)
  const coupleId = await getMyCoupleId(userId);
  if (!coupleId) {
    sendError(res, 403, 'NO_COUPLE', '커플 공간에 참여한 후 일기를 작성할 수 있습니다.');
    return;
  }

  const supabase = createUserClient(accessToken);

  // 일기 INSERT (RLS: couple_id = my_couple_id(), author_id = auth.uid() 검증)
  const { data: diary, error: diaryError } = await supabase
    .from('diaries')
    .insert({ couple_id: coupleId, author_id: userId, title, content, diary_date, mood, tags })
    .select()
    .single();

  if (diaryError || !diary) {
    sendInternalError(res, '일기 저장에 실패했습니다.');
    return;
  }

  // 이미지 INSERT (RLS: couple_id = my_couple_id(), uploader_id = auth.uid() 검증)
  let savedImages: unknown[] = [];
  if (images && images.length > 0) {
    const { data: imgData, error: imgError } = await supabase
      .from('diary_images')
      .insert(
        images.map((img, idx) => ({
          diary_id:             diary.id,
          couple_id:            coupleId,
          uploader_id:          userId,
          cloudinary_public_id: img.cloudinary_public_id,
          secure_url:           img.secure_url,
          sort_order:           img.sort_order ?? idx,
        })),
      )
      .select();

    if (imgError) {
      // 이미지 저장 실패 시 일기는 유지하고 경고만 로그
      console.error('[DIARY] 이미지 저장 실패:', imgError.message);
    } else {
      savedImages = imgData ?? [];
    }
  }

  // 파트너 알림 생성 (service role 사용 — notifications INSERT RLS 없음, 서버만 생성)
  const partnerId = await getPartnerId(userId, coupleId);
  if (partnerId) {
    const { error: notifError } = await supabaseAdmin.from('notifications').insert({
      couple_id:       coupleId,
      recipient_id:    partnerId,
      actor_id:        userId,
      type:            'diary_created',
      target_diary_id: diary.id,
      message:         `새로운 일기가 작성되었습니다: "${title}"`,
    });
    if (notifError) {
      console.error('[NOTIFY] 알림 생성 실패:', notifError.message);
    }
  }

  sendSuccess(res, { ...diary, diary_images: savedImages }, 201);
});

// Read status for requested accessible diaries.
router.get('/read-status', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { userId, accessToken } = req as AuthenticatedRequest;
  const parsed = parseIdList(req.query.ids);

  if (parsed.error) {
    sendBadRequest(res, parsed.error);
    return;
  }

  const supabase = createUserClient(accessToken);

  const { data: diaries, error: diaryError } = await supabase
    .from('diaries')
    .select('id')
    .in('id', parsed.ids);

  if (diaryError) {
    sendInternalError(res, 'Failed to fetch diaries.');
    return;
  }

  const accessibleIds = (diaries ?? []).map((diary) => diary.id as string);
  const accessibleIdSet = new Set(accessibleIds);

  if (accessibleIds.length === 0) {
    sendSuccess(res, {});
    return;
  }

  const { readMap, error: readsError } = await fetchMyReadMap(
    supabase,
    userId,
    accessibleIds,
  );

  if (readsError) {
    sendInternalError(res, 'Failed to fetch diary read status.');
    return;
  }

  const result: Record<string, string | null> = {};
  for (const id of parsed.ids) {
    if (accessibleIdSet.has(id)) {
      result[id] = readMap.get(id) ?? null;
    }
  }

  sendSuccess(res, result);
});

// Mark one accessible diary as read by the current user.
router.put('/:id/read', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { userId, accessToken } = req as AuthenticatedRequest;
  const { id } = req.params;

  if (!uuidSchema.safeParse(id).success) {
    sendBadRequest(res, 'id must be a UUID.');
    return;
  }

  const supabase = createUserClient(accessToken);

  const { data: diary, error: diaryError } = await supabase
    .from('diaries')
    .select('id')
    .eq('id', id)
    .maybeSingle();

  if (diaryError) {
    sendInternalError(res, 'Failed to fetch diary.');
    return;
  }

  if (!diary) {
    sendNotFound(res, '?쇨린瑜?李얠쓣 ???놁뒿?덈떎.');
    return;
  }

  const { error: upsertError } = await supabase
    .from('diary_reads')
    .upsert(
      { user_id: userId, diary_id: id },
      { onConflict: 'user_id,diary_id', ignoreDuplicates: true },
    );

  if (upsertError) {
    if (isDiaryReadsUnavailableError(upsertError)) {
      warnMissingDiaryReadsTable(upsertError);
      sendSuccess(res, {
        diary_id: id,
        read_at:  new Date().toISOString(),
      });
      return;
    }

    console.error('[DIARY READ] upsert error:', upsertError);
    sendInternalError(res, 'Failed to mark diary as read.');
    return;
  }

  const { data: read, error: readError } = await supabase
    .from('diary_reads')
    .select('diary_id, read_at')
    .eq('user_id', userId)
    .eq('diary_id', id)
    .maybeSingle();

  if (readError || !read) {
    if (readError && isDiaryReadsUnavailableError(readError)) {
      warnMissingDiaryReadsTable(readError);
      sendSuccess(res, {
        diary_id: id,
        read_at:  new Date().toISOString(),
      });
      return;
    }

    sendInternalError(res, 'Failed to fetch diary read status.');
    return;
  }

  sendSuccess(res, {
    diary_id: read.diary_id,
    read_at:  read.read_at,
  });
});

// ────────────────────────────────────────────────────────────
// GET /diaries/:id
// 단일 일기 조회 (이미지 + 댓글 + 반응 포함)
// ────────────────────────────────────────────────────────────
router.get('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { userId, accessToken } = req as AuthenticatedRequest;
  const { id } = req.params;
  const supabase = createUserClient(accessToken);

  const { data, error } = await supabase
    .from('diaries')
    .select('*, diary_images(*), comments(*), diary_reactions(*)')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    sendInternalError(res, '일기 조회에 실패했습니다.');
    return;
  }

  if (!data) {
    sendNotFound(res, '일기를 찾을 수 없습니다.');
    return;
  }

  const { readMap, error: readsError } = await fetchMyReadMap(
    supabase,
    userId,
    [data.id as string],
  );

  if (readsError) {
    sendInternalError(res, 'Failed to fetch diary read status.');
    return;
  }

  sendSuccess(res, {
    ...data,
    my_read_at: readMap.get(data.id as string) ?? null,
  });
});

// ────────────────────────────────────────────────────────────
// PATCH /diaries/:id
// 일기 수정 (작성자만 가능)
// ────────────────────────────────────────────────────────────
router.patch('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { userId, accessToken } = req as AuthenticatedRequest;
  const { id } = req.params;

  const parsed = updateDiarySchema.safeParse(req.body);
  if (!parsed.success) {
    sendBadRequest(res, parsed.error.errors[0].message);
    return;
  }

  if (Object.keys(parsed.data).length === 0) {
    sendBadRequest(res, '수정할 항목을 하나 이상 입력해주세요.');
    return;
  }

  // diary_date 변경 시 미래 날짜 차단
  if (parsed.data.diary_date && isFutureDate(parsed.data.diary_date)) {
    sendBadRequest(res, '미래 날짜로 변경할 수 없습니다.');
    return;
  }

  const supabase = createUserClient(accessToken);

  // 일기 존재 여부 + 작성자 확인 (SELECT RLS: 커플 멤버 모두 조회 가능)
  const { data: existing } = await supabase
    .from('diaries')
    .select('id, author_id')
    .eq('id', id)
    .maybeSingle();

  if (!existing) {
    sendNotFound(res, '일기를 찾을 수 없습니다.');
    return;
  }

  if (existing.author_id !== userId) {
    sendForbidden(res, '본인이 작성한 일기만 수정할 수 있습니다.');
    return;
  }

  const { images, ...diaryFields } = parsed.data;

  // 일기 본문 UPDATE (RLS: author_id = auth.uid() 검증)
  const { data: updated, error: updateError } = await supabase
    .from('diaries')
    .update(diaryFields)
    .eq('id', id)
    .select()
    .single();

  if (updateError || !updated) {
    sendInternalError(res, '일기 수정에 실패했습니다.');
    return;
  }

  // 이미지 교체 (images 배열이 요청에 포함된 경우에만)
  let savedImages: unknown[] = [];
  if (images !== undefined) {
    // 기존 이미지 삭제 (service role 사용 — 상대방이 올린 이미지도 교체 가능하도록)
    await supabaseAdmin.from('diary_images').delete().eq('diary_id', id);

    if (images.length > 0) {
      const coupleId = await getMyCoupleId(userId);
      const { data: imgData } = await supabase
        .from('diary_images')
        .insert(
          images.map((img, idx) => ({
            diary_id:             id,
            couple_id:            coupleId,
            uploader_id:          userId,
            cloudinary_public_id: img.cloudinary_public_id,
            secure_url:           img.secure_url,
            sort_order:           img.sort_order ?? idx,
          })),
        )
        .select();

      savedImages = imgData ?? [];
    }
  } else {
    // images를 건드리지 않은 경우 기존 이미지 그대로 반환
    const { data: existingImages } = await supabase
      .from('diary_images')
      .select('*')
      .eq('diary_id', id)
      .order('sort_order');

    savedImages = existingImages ?? [];
  }

  sendSuccess(res, { ...updated, diary_images: savedImages });
});

// ────────────────────────────────────────────────────────────
// DELETE /diaries/:id
// 일기 soft delete (작성자만 가능)
// ────────────────────────────────────────────────────────────
router.delete('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { userId, accessToken } = req as AuthenticatedRequest;
  const { id } = req.params;
  const supabase = createUserClient(accessToken);

  // 일기 존재 여부 + 작성자 확인
  const { data: existing } = await supabase
    .from('diaries')
    .select('id, author_id')
    .eq('id', id)
    .maybeSingle();

  if (!existing) {
    sendNotFound(res, '일기를 찾을 수 없습니다.');
    return;
  }

  if (existing.author_id !== userId) {
    sendForbidden(res, '본인이 작성한 일기만 삭제할 수 있습니다.');
    return;
  }

  // soft delete — service role 사용
  // diaries SELECT RLS 에 `deleted_at IS NULL` 조건이 있어서,
  // user client UPDATE 시 PostgREST가 업데이트 후 SELECT RLS 재검증 충돌로 500 발생.
  // 소유권 확인은 위에서 완료했으므로 여기서는 service role로 우회.
  const { error } = await supabaseAdmin
    .from('diaries')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('author_id', userId);

  if (error) {
    console.error('[DIARY DELETE] update error:', error);
    sendInternalError(res, '일기 삭제에 실패했습니다.');
    return;
  }

  sendSuccess(res, { message: '일기가 삭제되었습니다.' });
});

export default router;
