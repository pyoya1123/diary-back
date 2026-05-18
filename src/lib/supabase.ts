import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';

/**
 * Service role client — RLS를 우회하므로 서버 내부 작업에만 사용.
 * 사용 사례:
 *   - couple_members INSERT (사용자가 아직 커플 미가입 상태이므로 RLS 우회 필요)
 *   - couples INSERT/조회 (커플 참여 전 invite_code 검색)
 *   - 알림 INSERT (수신자를 대신하여 서버가 생성)
 * 절대 클라이언트(프론트엔드)에 노출하지 말 것.
 */
export const supabaseAdmin = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

/**
 * 사용자 access token 기반 client — RLS 정책이 적용됨.
 * 사용자가 접근 가능한 데이터만 반환되므로 일반 CRUD에 사용.
 */
export function createUserClient(accessToken: string) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
