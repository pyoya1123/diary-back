import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { createUserClient, supabaseAdmin } from '../lib/supabase';
import { getMyCoupleId } from '../utils/couple';
import {
  sendSuccess,
  sendBadRequest,
  sendNotFound,
  sendError,
  sendInternalError,
} from '../utils/response';

const router = Router();

// ────────────────────────────────────────────────────────────
// D-Day 계산 유틸
// ────────────────────────────────────────────────────────────

const ONE_DAY_MS = 1000 * 60 * 60 * 24;

/**
 * started_on(YYYY-MM-DD) 기준으로 오늘이 사귄 지 며칠째인지 반환한다.
 * 사귄 날 당일 = 1일째.
 */
function calcDayCount(startedOn: string): number {
  const start = new Date(startedOn);
  start.setUTCHours(0, 0, 0, 0);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - start.getTime()) / ONE_DAY_MS) + 1;
}

/**
 * 다음 100일 단위 기념일과 남은 일수를 반환한다.
 * 오늘이 기념일 당일이면 days_left = 0.
 */
function calcNextMilestone(dayCount: number): { milestone: number; days_left: number } {
  const milestone = Math.ceil(dayCount / 100) * 100;
  return { milestone, days_left: milestone - dayCount };
}

/**
 * started_on 기준으로 N일째 날짜(YYYY-MM-DD)를 계산한다.
 */
function dateOfDay(startedOn: string, nthDay: number): string {
  const start = new Date(startedOn);
  start.setUTCHours(0, 0, 0, 0);
  const result = new Date(start.getTime() + (nthDay - 1) * ONE_DAY_MS);
  return result.toISOString().slice(0, 10);
}

// ────────────────────────────────────────────────────────────
// GET /anniversary
// 사귄 날짜 기반 D-Day + 기념일 목록 반환
// ────────────────────────────────────────────────────────────
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { userId, accessToken } = req as AuthenticatedRequest;

  const coupleId = await getMyCoupleId(userId);
  if (!coupleId) {
    sendError(res, 403, 'NO_COUPLE', '커플 공간에 참여한 후 기념일을 조회할 수 있습니다.');
    return;
  }

  const supabase = createUserClient(accessToken);

  // 커플 정보 조회 (started_on 포함)
  const { data: couple, error: coupleError } = await supabase
    .from('couples')
    .select('id, name, started_on')
    .eq('id', coupleId)
    .single();

  if (coupleError || !couple) {
    sendInternalError(res, '커플 정보 조회에 실패했습니다.');
    return;
  }

  // 커스텀 기념일 목록
  const { data: customAnniversaries } = await supabase
    .from('anniversaries')
    .select('id, title, date, type, created_by')
    .eq('couple_id', coupleId)
    .order('date');

  // started_on 이 설정되지 않은 경우
  const startedOn: string | null = couple.started_on as string | null;

  if (!startedOn) {
    sendSuccess(res, {
      started_on:       null,
      day_count:        null,
      today:            new Date().toISOString().slice(0, 10),
      next_milestone:   null,
      anniversaries:    customAnniversaries ?? [],
    });
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const dayCount = calcDayCount(startedOn);
  const { milestone, days_left } = calcNextMilestone(dayCount);

  // 100일 단위 기념일 목록 (과거 ~ 미래 300일 내) 자동 생성
  const milestones: { label: string; date: string; day_count: number; is_past: boolean }[] = [];
  for (let n = 100; n <= dayCount + 300; n += 100) {
    const d = dateOfDay(startedOn, n);
    milestones.push({
      label:     `${n}일`,
      date:      d,
      day_count: n,
      is_past:   d < today,
    });
  }

  sendSuccess(res, {
    started_on:     startedOn,
    day_count:      dayCount,
    today,
    next_milestone: {
      day_count:  milestone,
      date:       dateOfDay(startedOn, milestone),
      days_left,
    },
    milestones,
    anniversaries:  customAnniversaries ?? [],
  });
});

// ────────────────────────────────────────────────────────────
// PATCH /anniversary
// 사귄 날짜(started_on)를 수정한다.
// couples 테이블에 UPDATE RLS가 없으므로 service role 사용.
// 커플 멤버 여부는 백엔드에서 직접 검증한다.
// ────────────────────────────────────────────────────────────
const updateAnniversarySchema = z.object({
  started_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, '날짜 형식은 YYYY-MM-DD이어야 합니다.')
    .nullable(),
});

router.patch('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;

  const parsed = updateAnniversarySchema.safeParse(req.body);
  if (!parsed.success) {
    sendBadRequest(res, parsed.error.errors[0].message);
    return;
  }

  // 커플 멤버 여부 확인
  const coupleId = await getMyCoupleId(userId);
  if (!coupleId) {
    sendError(res, 403, 'NO_COUPLE', '커플 공간에 참여한 후 기념일을 수정할 수 있습니다.');
    return;
  }

  // couples UPDATE RLS 미정의 — service role로 업데이트
  // (커플 멤버 인증은 위 coupleId 확인으로 완료)
  const { data: updated, error } = await supabaseAdmin
    .from('couples')
    .update({ started_on: parsed.data.started_on })
    .eq('id', coupleId)
    .select('id, name, started_on')
    .single();

  if (error || !updated) {
    sendInternalError(res, '기념일 수정에 실패했습니다.');
    return;
  }

  const startedOn: string | null = updated.started_on as string | null;
  const today = new Date().toISOString().slice(0, 10);

  const dayInfo =
    startedOn
      ? (() => {
          const dayCount = calcDayCount(startedOn);
          const { milestone, days_left } = calcNextMilestone(dayCount);
          return {
            day_count: dayCount,
            next_milestone: {
              day_count: milestone,
              date:      dateOfDay(startedOn, milestone),
              days_left,
            },
          };
        })()
      : { day_count: null, next_milestone: null };

  sendSuccess(res, { ...updated, today, ...dayInfo });
});

export default router;
