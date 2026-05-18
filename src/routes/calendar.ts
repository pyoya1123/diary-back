import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { createUserClient } from '../lib/supabase';
import { sendSuccess, sendBadRequest, sendInternalError } from '../utils/response';

const router = Router();

const calendarQuerySchema = z.object({
  year:  z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

/**
 * GET /calendar?year=2026&month=5
 *
 * 해당 월의 날짜별 일기 현황을 반환한다.
 * RLS가 적용되므로 현재 사용자의 커플 공간 데이터만 조회된다.
 *
 * 응답 형식:
 * {
 *   "data": {
 *     "year": 2026,
 *     "month": 5,
 *     "today": "2026-05-17",
 *     "days": [
 *       {
 *         "date": "2026-05-17",
 *         "my_count": 1,
 *         "partner_count": 1,
 *         "moods": ["happy", "love"],
 *         "has_images": true
 *       }
 *     ]
 *   }
 * }
 */
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { userId, accessToken } = req as AuthenticatedRequest;

  const parsed = calendarQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    sendBadRequest(res, 'year와 month를 올바르게 입력해주세요. (예: ?year=2026&month=5)');
    return;
  }

  const { year, month } = parsed.data;

  // 해당 월의 시작일 / 마지막일
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  // new Date(year, month, 0): month 는 1-indexed, JS Date 생성자는 0-indexed이므로
  // month번째 달의 day 0 = (month-1)번째 달의 마지막 날이 아닌, month번째 달의 마지막 날
  // 예: new Date(2026, 5, 0) = 2026-05-31 (May 31)
  const endDate = new Date(year, month, 0).toISOString().slice(0, 10);

  const supabase = createUserClient(accessToken);

  // RLS 자동 적용: couple_id = my_couple_id(), deleted_at IS NULL
  const { data: diaries, error } = await supabase
    .from('diaries')
    .select('id, diary_date, mood, author_id, diary_images(id)')
    .gte('diary_date', startDate)
    .lte('diary_date', endDate);

  if (error) {
    sendInternalError(res, '캘린더 조회에 실패했습니다.');
    return;
  }

  // ── 날짜별 그룹화 ──────────────────────────────────────────
  type DayInfo = {
    date: string;
    my_count: number;
    partner_count: number;
    moods: string[];
    has_images: boolean;
  };

  const dayMap = new Map<string, DayInfo>();

  for (const diary of diaries ?? []) {
    const date: string = diary.diary_date;
    if (!dayMap.has(date)) {
      dayMap.set(date, { date, my_count: 0, partner_count: 0, moods: [], has_images: false });
    }

    const entry = dayMap.get(date)!;

    if (diary.author_id === userId) {
      entry.my_count++;
    } else {
      entry.partner_count++;
    }

    entry.moods.push(diary.mood as string);

    // diary_images 가 1개 이상이면 사진 있음
    if (Array.isArray(diary.diary_images) && (diary.diary_images as unknown[]).length > 0) {
      entry.has_images = true;
    }
  }

  const days = Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  const today = new Date().toISOString().slice(0, 10);

  sendSuccess(res, { year, month, today, days });
});

export default router;
