import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { createUserClient, supabaseAdmin } from '../lib/supabase';
import { sendSuccess, sendBadRequest, sendInternalError } from '../utils/response';

const router = Router();

const paginationSchema = z.object({
  limit:  z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// ────────────────────────────────────────────────────────────
// 프로필 맵 빌드 헬퍼
// auth.users -> profiles 는 cross-schema 조인 불가이므로
// author_id 목록을 수집해 별도 쿼리로 profiles를 가져온다.
// ────────────────────────────────────────────────────────────
async function fetchProfileMap(
  authorIds: string[],
  accessToken: string,
): Promise<Record<string, { id: string; display_name: string; avatar_url: string | null }>> {
  if (authorIds.length === 0) return {};

  const supabase = createUserClient(accessToken);
  const { data } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .in('id', authorIds);

  const map: Record<string, { id: string; display_name: string; avatar_url: string | null }> = {};
  for (const p of data ?? []) {
    map[p.id as string] = p as { id: string; display_name: string; avatar_url: string | null };
  }
  return map;
}

// ────────────────────────────────────────────────────────────
// GET /memories/photos
// 커플 공간의 사진을 최신순으로 반환한다.
// 각 항목에 이미지 URL, 일기 정보, 작성자 정보를 포함한다.
// ────────────────────────────────────────────────────────────
router.get('/photos', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { accessToken } = req as AuthenticatedRequest;

  const parsed = paginationSchema.safeParse(req.query);
  if (!parsed.success) {
    sendBadRequest(res, '잘못된 페이지네이션 파라미터입니다.');
    return;
  }

  const { limit, offset } = parsed.data;
  const supabase = createUserClient(accessToken);

  /**
   * diary_images -> diaries 조인
   * diaries 의 RLS(deleted_at IS NULL)가 함께 적용되므로
   * 삭제된 일기의 이미지는 반환되지 않는다.
   *
   * "diaries!diary_id" 는 diary_id FK를 통한 명시적 조인 힌트.
   * Supabase PostgREST 에서 FK 이름이 중복될 때 사용한다.
   */
  const { data: images, error } = await supabase
    .from('diary_images')
    .select('id, secure_url, cloudinary_public_id, sort_order, created_at, diary_id, diaries(id, title, diary_date, author_id)')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    sendInternalError(res, '추억 사진 조회에 실패했습니다.');
    return;
  }

  type DiaryRef = { id: string; title: string; diary_date: string; author_id: string };

  // author_id 수집 후 profiles 조회
  const authorIds = [
    ...new Set(
      (images ?? [])
        .map((img) => {
          const diary = img.diaries as unknown as DiaryRef | null;
          return diary?.author_id;
        })
        .filter((id): id is string => !!id),
    ),
  ];

  const profileMap = await fetchProfileMap(authorIds, accessToken);

  const result = (images ?? []).map((img) => {
    const diary = img.diaries as unknown as DiaryRef | null;

    return {
      id:                   img.id,
      secure_url:           img.secure_url,
      cloudinary_public_id: img.cloudinary_public_id,
      sort_order:           img.sort_order,
      created_at:           img.created_at,
      diary: diary
        ? {
            id:         diary.id,
            title:      diary.title,
            diary_date: diary.diary_date,
            author:     profileMap[diary.author_id] ?? { id: diary.author_id, display_name: '알 수 없음', avatar_url: null },
          }
        : null,
    };
  });

  sendSuccess(res, { total: result.length, offset, limit, photos: result });
});

// ────────────────────────────────────────────────────────────
// GET /memories/timeline
// 일기를 월별로 그룹화해서 최신 월부터 반환한다.
// 각 일기에 thumbnail_url(첫 번째 이미지) 포함.
// ────────────────────────────────────────────────────────────
router.get('/timeline', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { accessToken } = req as AuthenticatedRequest;

  const parsed = paginationSchema.safeParse(req.query);
  if (!parsed.success) {
    sendBadRequest(res, '잘못된 페이지네이션 파라미터입니다.');
    return;
  }

  const { limit, offset } = parsed.data;
  const supabase = createUserClient(accessToken);

  // RLS 자동 적용: couple_id = my_couple_id(), deleted_at IS NULL
  const { data: diaries, error } = await supabase
    .from('diaries')
    .select('id, title, diary_date, mood, author_id, tags, diary_images(secure_url, sort_order)')
    .order('diary_date', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    sendInternalError(res, '타임라인 조회에 실패했습니다.');
    return;
  }

  // author_id 수집 후 profiles 조회
  const authorIds = [
    ...new Set((diaries ?? []).map((d) => d.author_id as string).filter(Boolean)),
  ];
  const profileMap = await fetchProfileMap(authorIds, accessToken);

  // ── 월별 그룹화 ──────────────────────────────────────────
  type TimelineEntry = {
    id: string;
    title: string;
    diary_date: string;
    mood: string;
    tags: string[];
    thumbnail_url: string | null;
    author: { id: string; display_name: string; avatar_url: string | null };
  };

  const monthMap = new Map<string, TimelineEntry[]>();

  for (const diary of diaries ?? []) {
    const month = (diary.diary_date as string).slice(0, 7); // "2026-05"

    if (!monthMap.has(month)) {
      monthMap.set(month, []);
    }

    // 첫 번째 이미지를 thumbnail로 사용 (sort_order 기준)
    const images = diary.diary_images as { secure_url: string; sort_order: number }[];
    const sortedImages = [...images].sort((a, b) => a.sort_order - b.sort_order);
    const thumbnailUrl = sortedImages[0]?.secure_url ?? null;

    const authorId = diary.author_id as string;

    monthMap.get(month)!.push({
      id:            diary.id as string,
      title:         diary.title as string,
      diary_date:    diary.diary_date as string,
      mood:          diary.mood as string,
      tags:          (diary.tags as string[]) ?? [],
      thumbnail_url: thumbnailUrl,
      author:        profileMap[authorId] ?? { id: authorId, display_name: '알 수 없음', avatar_url: null },
    });
  }

  // Map → Array (최신 월 순서는 쿼리 정렬로 이미 보장됨)
  const timeline = Array.from(monthMap.entries()).map(([month, entries]) => ({
    month,
    diaries: entries,
  }));

  sendSuccess(res, { timeline });
});

export default router;
