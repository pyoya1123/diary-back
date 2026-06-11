# Deploy

## 1. Apply Supabase migrations

Run the SQL files under `supabase/migrations` in Supabase before deploying API code that depends on new tables or policies.

For the diary read feature, apply:

```text
supabase/migrations/20260611000000_add_diary_reads.sql
```

## 2. Deploy code and environment variables to Cloud Run

```bash
gcloud run deploy diary-back \
  --source . \
  --region asia-northeast3 \
  --env-vars-file env.yaml
```

## 3. Update environment variables only

Use this only when changing environment variables without changing code:

```bash
gcloud run services update diary-back \
  --region asia-northeast3 \
  --env-vars-file env.yaml
```

## 4. Smoke test

```bash
curl https://diary-back-812734603703.asia-northeast3.run.app/health
```
