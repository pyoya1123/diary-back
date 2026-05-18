-- ============================================================
-- 커플 일기 앱 초기 스키마
-- ============================================================

-- UUID 확장
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 테이블 생성
-- ============================================================

-- profiles: auth.users와 1:1 연결
CREATE TABLE IF NOT EXISTS public.profiles (
  id            uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  text        NOT NULL,
  avatar_url    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- couples: 커플 공간
CREATE TABLE IF NOT EXISTS public.couples (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        text        NOT NULL,
  started_on  date,
  invite_code text        UNIQUE NOT NULL,
  created_by  uuid        NOT NULL REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- couple_members: 커플 공간 멤버 (최대 2명)
-- user_id UNIQUE 제약으로 한 사용자는 하나의 커플 공간에만 참여 가능
CREATE TABLE IF NOT EXISTS public.couple_members (
  couple_id  uuid        NOT NULL REFERENCES public.couples(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       text        NOT NULL CHECK (role IN ('owner', 'member')),
  joined_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (couple_id, user_id),
  UNIQUE (user_id)
);

-- diaries: 일기
CREATE TABLE IF NOT EXISTS public.diaries (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  couple_id   uuid        NOT NULL REFERENCES public.couples(id) ON DELETE CASCADE,
  author_id   uuid        NOT NULL REFERENCES auth.users(id),
  title       text        NOT NULL,
  content     text        NOT NULL,
  diary_date  date        NOT NULL,
  mood        text        NOT NULL CHECK (mood IN ('happy', 'love', 'calm', 'sad', 'tired')),
  tags        text[]      NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

-- diary_images: 일기 첨부 이미지 (Cloudinary)
CREATE TABLE IF NOT EXISTS public.diary_images (
  id                   uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  diary_id             uuid        NOT NULL REFERENCES public.diaries(id) ON DELETE CASCADE,
  couple_id            uuid        NOT NULL REFERENCES public.couples(id),
  uploader_id          uuid        NOT NULL REFERENCES auth.users(id),
  cloudinary_public_id text        NOT NULL,
  secure_url           text        NOT NULL,
  sort_order           int         NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- comments: 댓글
CREATE TABLE IF NOT EXISTS public.comments (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  diary_id    uuid        NOT NULL REFERENCES public.diaries(id) ON DELETE CASCADE,
  couple_id   uuid        NOT NULL REFERENCES public.couples(id),
  author_id   uuid        NOT NULL REFERENCES auth.users(id),
  content     text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

-- diary_reactions: 이모지 반응 (일기당 사용자 1개)
CREATE TABLE IF NOT EXISTS public.diary_reactions (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  diary_id    uuid        NOT NULL REFERENCES public.diaries(id) ON DELETE CASCADE,
  couple_id   uuid        NOT NULL REFERENCES public.couples(id),
  user_id     uuid        NOT NULL REFERENCES auth.users(id),
  emoji       text        NOT NULL CHECK (emoji IN ('❤️', '🥰', '😂', '😢', '👏')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (diary_id, user_id)
);

-- anniversaries: 기념일
CREATE TABLE IF NOT EXISTS public.anniversaries (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  couple_id   uuid        NOT NULL REFERENCES public.couples(id) ON DELETE CASCADE,
  title       text        NOT NULL,
  date        date        NOT NULL,
  type        text        NOT NULL CHECK (type IN ('dating_start', 'custom')),
  created_by  uuid        NOT NULL REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- notifications: 앱 내 알림
CREATE TABLE IF NOT EXISTS public.notifications (
  id              uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  couple_id       uuid        NOT NULL REFERENCES public.couples(id),
  recipient_id    uuid        NOT NULL REFERENCES auth.users(id),
  actor_id        uuid        NOT NULL REFERENCES auth.users(id),
  type            text        NOT NULL CHECK (type IN ('diary_created', 'comment_created', 'reaction_created')),
  target_diary_id uuid        REFERENCES public.diaries(id),
  message         text        NOT NULL,
  read_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 인덱스
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_couple_members_user_id    ON public.couple_members(user_id);
CREATE INDEX IF NOT EXISTS idx_diaries_couple_id         ON public.diaries(couple_id);
CREATE INDEX IF NOT EXISTS idx_diaries_diary_date        ON public.diaries(diary_date);
CREATE INDEX IF NOT EXISTS idx_diaries_author_id         ON public.diaries(author_id);
CREATE INDEX IF NOT EXISTS idx_diary_images_diary_id     ON public.diary_images(diary_id);
CREATE INDEX IF NOT EXISTS idx_comments_diary_id         ON public.comments(diary_id);
CREATE INDEX IF NOT EXISTS idx_diary_reactions_diary_id  ON public.diary_reactions(diary_id);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_id ON public.notifications(recipient_id);
CREATE INDEX IF NOT EXISTS idx_anniversaries_couple_id   ON public.anniversaries(couple_id);

-- ============================================================
-- updated_at 자동 갱신 트리거
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_couples_updated_at
  BEFORE UPDATE ON public.couples
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_diaries_updated_at
  BEFORE UPDATE ON public.diaries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_comments_updated_at
  BEFORE UPDATE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_diary_reactions_updated_at
  BEFORE UPDATE ON public.diary_reactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_anniversaries_updated_at
  BEFORE UPDATE ON public.anniversaries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 신규 사용자 가입 시 profile 자동 생성 트리거
-- (Supabase Auth에서 새 유저 생성 시 호출됨)
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', '사용자')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 비즈니스 규칙 트리거
-- ============================================================

-- 커플 공간 최대 2명 제한
CREATE OR REPLACE FUNCTION public.check_couple_member_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF (
    SELECT COUNT(*) FROM public.couple_members WHERE couple_id = NEW.couple_id
  ) >= 2 THEN
    RAISE EXCEPTION 'couple_full'
      USING DETAIL = '커플 공간에는 최대 두 명만 참여할 수 있습니다.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_couple_member_limit
  BEFORE INSERT ON public.couple_members
  FOR EACH ROW EXECUTE FUNCTION public.check_couple_member_limit();

-- 일기당 이미지 최대 3개 제한
CREATE OR REPLACE FUNCTION public.check_diary_image_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF (
    SELECT COUNT(*) FROM public.diary_images WHERE diary_id = NEW.diary_id
  ) >= 3 THEN
    RAISE EXCEPTION 'image_limit_exceeded'
      USING DETAIL = '일기 하나에는 이미지를 최대 3개까지만 첨부할 수 있습니다.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_diary_image_limit
  BEFORE INSERT ON public.diary_images
  FOR EACH ROW EXECUTE FUNCTION public.check_diary_image_limit();

-- ============================================================
-- RLS 헬퍼 함수
-- SECURITY DEFINER 로 실행되어 couple_members 조회 시 RLS 순환 참조 방지
-- ============================================================

CREATE OR REPLACE FUNCTION public.my_couple_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT couple_id FROM public.couple_members WHERE user_id = auth.uid() LIMIT 1;
$$;

-- ============================================================
-- RLS 활성화
-- ============================================================

ALTER TABLE public.profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.couples         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.couple_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diaries         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diary_images    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diary_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anniversaries   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications   ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS 정책
-- ============================================================

-- profiles
-- 본인 프로필 + 커플 상대방 프로필 조회 가능
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT USING (
    auth.uid() = id
    OR id IN (
      SELECT user_id FROM public.couple_members
      WHERE couple_id = public.my_couple_id()
    )
  );

-- 본인 프로필만 INSERT (가입 트리거 보완용)
CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- 본인 프로필만 수정 가능
CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- couples
-- 본인이 속한 커플 공간만 조회 가능
CREATE POLICY "couples_select" ON public.couples
  FOR SELECT USING (id = public.my_couple_id());

-- couple_members
-- INSERT는 백엔드 service role 전용. RLS에서 직접 INSERT 불허.
-- SELECT: 같은 커플 멤버끼리만 조회 가능
CREATE POLICY "couple_members_select" ON public.couple_members
  FOR SELECT USING (couple_id = public.my_couple_id());

-- diaries
-- 같은 커플 공간의 삭제되지 않은 일기 조회 가능
CREATE POLICY "diaries_select" ON public.diaries
  FOR SELECT USING (
    couple_id = public.my_couple_id()
    AND deleted_at IS NULL
  );

-- 본인 couple_id로만 INSERT, author_id 고정
CREATE POLICY "diaries_insert" ON public.diaries
  FOR INSERT WITH CHECK (
    couple_id = public.my_couple_id()
    AND author_id = auth.uid()
  );

-- 본인이 작성한 일기만 수정 가능 (soft delete 포함)
CREATE POLICY "diaries_update" ON public.diaries
  FOR UPDATE USING (
    author_id = auth.uid()
    AND couple_id = public.my_couple_id()
  );

-- diary_images
CREATE POLICY "diary_images_select" ON public.diary_images
  FOR SELECT USING (couple_id = public.my_couple_id());

CREATE POLICY "diary_images_insert" ON public.diary_images
  FOR INSERT WITH CHECK (
    couple_id = public.my_couple_id()
    AND uploader_id = auth.uid()
  );

CREATE POLICY "diary_images_delete" ON public.diary_images
  FOR DELETE USING (uploader_id = auth.uid());

-- comments
-- 삭제되지 않은 댓글만 조회
CREATE POLICY "comments_select" ON public.comments
  FOR SELECT USING (
    couple_id = public.my_couple_id()
    AND deleted_at IS NULL
  );

CREATE POLICY "comments_insert" ON public.comments
  FOR INSERT WITH CHECK (
    couple_id = public.my_couple_id()
    AND author_id = auth.uid()
  );

-- 본인 댓글만 수정 가능 (soft delete 포함)
CREATE POLICY "comments_update" ON public.comments
  FOR UPDATE USING (author_id = auth.uid());

-- diary_reactions
CREATE POLICY "diary_reactions_select" ON public.diary_reactions
  FOR SELECT USING (couple_id = public.my_couple_id());

CREATE POLICY "diary_reactions_insert" ON public.diary_reactions
  FOR INSERT WITH CHECK (
    couple_id = public.my_couple_id()
    AND user_id = auth.uid()
  );

CREATE POLICY "diary_reactions_update" ON public.diary_reactions
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "diary_reactions_delete" ON public.diary_reactions
  FOR DELETE USING (user_id = auth.uid());

-- anniversaries
CREATE POLICY "anniversaries_select" ON public.anniversaries
  FOR SELECT USING (couple_id = public.my_couple_id());

CREATE POLICY "anniversaries_insert" ON public.anniversaries
  FOR INSERT WITH CHECK (
    couple_id = public.my_couple_id()
    AND created_by = auth.uid()
  );

-- 두 사람 모두 기념일 수정 가능
CREATE POLICY "anniversaries_update" ON public.anniversaries
  FOR UPDATE USING (couple_id = public.my_couple_id());

CREATE POLICY "anniversaries_delete" ON public.anniversaries
  FOR DELETE USING (created_by = auth.uid());

-- notifications
-- 본인 수신 알림만 조회 가능
CREATE POLICY "notifications_select" ON public.notifications
  FOR SELECT USING (recipient_id = auth.uid());

-- 읽음 처리를 위한 UPDATE (recipient_id 본인만)
CREATE POLICY "notifications_update" ON public.notifications
  FOR UPDATE USING (recipient_id = auth.uid());
