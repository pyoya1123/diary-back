import { supabaseAdmin } from '../lib/supabase';

/**
 * 현재 사용자의 couple_id를 반환한다.
 * service role 사용 — RLS 없이 조회 (커플 미가입 상태에서도 호출될 수 있음).
 */
export async function getMyCoupleId(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('couple_members')
    .select('couple_id')
    .eq('user_id', userId)
    .maybeSingle();

  return data?.couple_id ?? null;
}

/**
 * 커플 공간에서 상대방 user_id를 반환한다.
 * 상대방이 아직 참여하지 않은 경우 null을 반환한다.
 */
export async function getPartnerId(
  userId: string,
  coupleId: string,
): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('couple_members')
    .select('user_id')
    .eq('couple_id', coupleId)
    .neq('user_id', userId)
    .maybeSingle();

  return data?.user_id ?? null;
}
