import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { createUserClient, supabaseAdmin } from '../lib/supabase';
import {
  sendSuccess,
  sendBadRequest,
  sendNotFound,
  sendError,
  sendInternalError,
} from '../utils/response';

const router = Router();

const createCoupleSchema = z.object({
  name:       z.string().min(1, '커플 이름을 입력해주세요.').max(100),
  started_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, '날짜 형식은 YYYY-MM-DD이어야 합니다.')
    .nullable()
    .optional(),
});

const joinCoupleSchema = z.object({
  invite_code: z.string().min(1, '초대 코드를 입력해주세요.'),
});

/** 8자리 영문 대문자 + 숫자 초대 코드 생성 */
function generateInviteCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from(
    { length: 8 },
    () => chars[Math.floor(Math.random() * chars.length)],
  ).join('');
}

/**
 * POST /couples
 * 새 커플 공간을 생성하고 생성자를 owner로 추가한다.
 * couple_members INSERT는 service role로 처리 (RLS 우회 필요 — 멤버 가입 전이라 RLS 통과 불가).
 */
router.post('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;

  const parsed = createCoupleSchema.safeParse(req.body);
  if (!parsed.success) {
    sendBadRequest(res, parsed.error.errors[0].message);
    return;
  }

  // 이미 커플 공간에 속해 있는지 확인
  const { data: existing } = await supabaseAdmin
    .from('couple_members')
    .select('couple_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    sendError(res, 409, 'ALREADY_IN_COUPLE', '이미 커플 공간에 참여 중입니다.');
    return;
  }

  // invite_code 충돌 방지 루프 (확률적으로 거의 발생 안 하지만 안전하게)
  let inviteCode = generateInviteCode();
  let attempts = 0;
  while (attempts < 5) {
    const { data: codeConflict } = await supabaseAdmin
      .from('couples')
      .select('id')
      .eq('invite_code', inviteCode)
      .maybeSingle();
    if (!codeConflict) break;
    inviteCode = generateInviteCode();
    attempts++;
  }

  // 커플 공간 생성 (service role 사용 — 생성 직전까지 커플 미가입 상태)
  const { data: couple, error: coupleError } = await supabaseAdmin
    .from('couples')
    .insert({
      name:       parsed.data.name,
      started_on: parsed.data.started_on ?? null,
      invite_code: inviteCode,
      created_by: userId,
    })
    .select()
    .single();

  if (coupleError || !couple) {
    sendInternalError(res, '커플 공간 생성에 실패했습니다.');
    return;
  }

  // 생성자를 owner로 추가 (service role 사용 — RLS 우회 필요)
  const { error: memberError } = await supabaseAdmin
    .from('couple_members')
    .insert({ couple_id: couple.id, user_id: userId, role: 'owner' });

  if (memberError) {
    // 롤백: 생성된 커플 공간 삭제
    await supabaseAdmin.from('couples').delete().eq('id', couple.id);
    sendInternalError(res, '커플 공간 생성에 실패했습니다.');
    return;
  }

  sendSuccess(res, couple, 201);
});

/**
 * GET /couples/me
 * 현재 사용자가 속한 커플 공간 정보와 멤버 목록을 반환한다.
 */
router.get('/me', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { userId, accessToken } = req as AuthenticatedRequest;
  const supabase = createUserClient(accessToken);

  // 내 멤버십 조회 — user_id 필터 필수
  // user_id 없이 RLS(couple_id = my_couple_id())만 사용하면 커플 2명 가입 후
  // 2행이 반환되어 maybeSingle()이 실패한다.
  const { data: membership } = await supabase
    .from('couple_members')
    .select('couple_id, role, joined_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (!membership) {
    sendNotFound(res, '참여 중인 커플 공간이 없습니다.');
    return;
  }

  // 커플 공간 정보 조회 (RLS 적용)
  const { data: couple, error: coupleError } = await supabase
    .from('couples')
    .select('*')
    .eq('id', membership.couple_id)
    .single();

  if (coupleError || !couple) {
    sendNotFound(res, '커플 공간을 찾을 수 없습니다.');
    return;
  }

  // 멤버 목록 조회
  // couple_members.user_id → auth.users → profiles.id 로 직접 FK가 없어
  // PostgREST 자동 조인이 동작하지 않으므로 profiles를 별도 쿼리로 가져온다.
  const { data: memberRows } = await supabase
    .from('couple_members')
    .select('user_id, role, joined_at')
    .eq('couple_id', membership.couple_id);

  const userIds = (memberRows ?? []).map((m) => m.user_id as string);

  const { data: profileRows } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .in('id', userIds);

  const profileMap: Record<string, { id: string; display_name: string; avatar_url: string | null }> = {};
  for (const p of profileRows ?? []) {
    profileMap[p.id as string] = p as { id: string; display_name: string; avatar_url: string | null };
  }

  const members = (memberRows ?? []).map((m) => ({
    user_id:   m.user_id,
    role:      m.role,
    joined_at: m.joined_at,
    profiles:  profileMap[m.user_id as string] ?? null,
  }));

  sendSuccess(res, { ...couple, members });
});

/**
 * POST /couples/join
 * 초대 코드로 커플 공간에 참여한다.
 * couples 조회 + couple_members INSERT 모두 service role 사용
 * (아직 멤버가 아니므로 RLS 통과 불가).
 */
router.post('/join', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;

  const parsed = joinCoupleSchema.safeParse(req.body);
  if (!parsed.success) {
    sendBadRequest(res, parsed.error.errors[0].message);
    return;
  }

  // 이미 커플 공간에 속해 있는지 확인
  const { data: existing } = await supabaseAdmin
    .from('couple_members')
    .select('couple_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    sendError(res, 409, 'ALREADY_IN_COUPLE', '이미 커플 공간에 참여 중입니다.');
    return;
  }

  // 초대 코드로 커플 조회 (service role 사용 — 아직 멤버 아니므로 RLS 통과 불가)
  const { data: couple } = await supabaseAdmin
    .from('couples')
    .select('id, name, created_by')
    .eq('invite_code', parsed.data.invite_code)
    .maybeSingle();

  if (!couple) {
    sendNotFound(res, '유효하지 않은 초대 코드입니다.');
    return;
  }

  // 커플 공간 현재 멤버 수 확인 (DB 트리거와 이중 방어)
  const { count } = await supabaseAdmin
    .from('couple_members')
    .select('*', { count: 'exact', head: true })
    .eq('couple_id', couple.id);

  if ((count ?? 0) >= 2) {
    sendError(res, 409, 'COUPLE_FULL', '커플 공간이 이미 꽉 찼습니다.');
    return;
  }

  // couple_members INSERT (service role 사용 — RLS 우회 필요)
  const { error: memberError } = await supabaseAdmin
    .from('couple_members')
    .insert({ couple_id: couple.id, user_id: userId, role: 'member' });

  if (memberError) {
    // DB 트리거에서 couple_full 예외가 발생한 경우
    if (memberError.message.includes('couple_full')) {
      sendError(res, 409, 'COUPLE_FULL', '커플 공간이 이미 꽉 찼습니다.');
      return;
    }
    sendInternalError(res, '커플 공간 참여에 실패했습니다.');
    return;
  }

  sendSuccess(res, { couple_id: couple.id, message: '커플 공간에 참여했습니다.' }, 201);
});

export default router;
