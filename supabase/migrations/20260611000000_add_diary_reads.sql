CREATE TABLE IF NOT EXISTS public.diary_reads (
  user_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  diary_id uuid        NOT NULL REFERENCES public.diaries(id) ON DELETE CASCADE,
  read_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, diary_id)
);

CREATE INDEX IF NOT EXISTS idx_diary_reads_diary_id ON public.diary_reads(diary_id);
CREATE INDEX IF NOT EXISTS idx_diary_reads_user_id  ON public.diary_reads(user_id);

ALTER TABLE public.diary_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "diary_reads_select" ON public.diary_reads;
CREATE POLICY "diary_reads_select" ON public.diary_reads
  FOR SELECT USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.diaries d
      WHERE d.id = diary_id
        AND d.couple_id = public.my_couple_id()
        AND d.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "diary_reads_insert" ON public.diary_reads;
CREATE POLICY "diary_reads_insert" ON public.diary_reads
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.diaries d
      WHERE d.id = diary_id
        AND d.couple_id = public.my_couple_id()
        AND d.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "diary_reads_update" ON public.diary_reads;
CREATE POLICY "diary_reads_update" ON public.diary_reads
  FOR UPDATE USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.diaries d
      WHERE d.id = diary_id
        AND d.couple_id = public.my_couple_id()
        AND d.deleted_at IS NULL
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.diaries d
      WHERE d.id = diary_id
        AND d.couple_id = public.my_couple_id()
        AND d.deleted_at IS NULL
    )
  );

NOTIFY pgrst, 'reload schema';
