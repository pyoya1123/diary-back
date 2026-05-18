# 커플 일기 앱 — 백엔드 API 명세

**Base URL:** `http://localhost:4000` (개발환경)

---

## 공통

### 인증

모든 API 요청에는 Supabase 로그인 후 발급된 access token이 필요하다.

```
Authorization: Bearer {access_token}
```

토큰이 없거나 만료된 경우 `401` 을 반환한다.

---

### 응답 형식

**성공**
```json
{ "data": { ... } }
```

**실패**
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "사람이 읽을 수 있는 오류 메시지"
  }
}
```

---

### 에러 코드

| 상태코드 | code | 설명 |
|----------|------|------|
| 400 | `BAD_REQUEST` | 요청 바디/파라미터 검증 실패 |
| 401 | `UNAUTHORIZED` | 토큰 없음 또는 만료 |
| 403 | `FORBIDDEN` | 권한 없음 (타인 리소스 수정 시도 등) |
| 403 | `NO_COUPLE` | 커플 공간에 아직 참여하지 않음 |
| 404 | `NOT_FOUND` | 리소스 없음 |
| 409 | `ALREADY_IN_COUPLE` | 이미 커플 공간에 참여 중 |
| 409 | `COUPLE_FULL` | 커플 공간 인원이 이미 2명 |
| 500 | `INTERNAL_ERROR` | 서버 내부 오류 |

---

## Me (내 프로필)

### GET /me

현재 로그인한 사용자의 프로필을 반환한다.

**응답**
```json
{
  "data": {
    "id": "uuid",
    "display_name": "홍길동",
    "avatar_url": "https://res.cloudinary.com/...",
    "created_at": "2026-05-17T00:00:00Z",
    "updated_at": "2026-05-17T00:00:00Z"
  }
}
```

---

### PATCH /me

내 프로필을 수정한다. 변경할 필드만 보내면 된다.

**요청 바디**
```json
{
  "display_name": "새 이름",
  "avatar_url": "https://res.cloudinary.com/..."
}
```

| 필드 | 타입 | 필수 |
|------|------|------|
| `display_name` | string (max 50) | ❌ |
| `avatar_url` | string (URL) 또는 null | ❌ |

**응답** — 수정된 프로필 객체

---

## Couples (커플 공간)

### POST /couples

커플 공간을 생성한다. 생성자는 자동으로 `owner`로 추가되고 초대 코드(8자리)가 발급된다.

**요청 바디**
```json
{
  "name": "우리 커플",
  "started_on": "2025-01-01"
}
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `name` | string (max 100) | ✅ | 커플 공간 이름 |
| `started_on` | string `YYYY-MM-DD` | ❌ | 사귄 날짜 |

**응답 201**
```json
{
  "data": {
    "id": "uuid",
    "name": "우리 커플",
    "started_on": "2025-01-01",
    "invite_code": "ABCD1234",
    "created_by": "uuid",
    "created_at": "2026-05-17T00:00:00Z",
    "updated_at": "2026-05-17T00:00:00Z"
  }
}
```

---

### GET /couples/me

현재 사용자가 속한 커플 공간 정보와 멤버 목록을 반환한다.

**응답**
```json
{
  "data": {
    "id": "uuid",
    "name": "우리 커플",
    "started_on": "2025-01-01",
    "invite_code": "ABCD1234",
    "created_by": "uuid",
    "created_at": "2026-05-17T00:00:00Z",
    "updated_at": "2026-05-17T00:00:00Z",
    "members": [
      {
        "user_id": "uuid",
        "role": "owner",
        "joined_at": "2026-05-17T00:00:00Z",
        "profiles": {
          "id": "uuid",
          "display_name": "홍길동",
          "avatar_url": null
        }
      },
      {
        "user_id": "uuid",
        "role": "member",
        "joined_at": "2026-05-17T01:00:00Z",
        "profiles": {
          "id": "uuid",
          "display_name": "김영희",
          "avatar_url": null
        }
      }
    ]
  }
}
```

**오류**
- `404` — 아직 커플 공간에 참여하지 않은 경우

---

### POST /couples/join

초대 코드로 커플 공간에 참여한다.

**요청 바디**
```json
{
  "invite_code": "ABCD1234"
}
```

**응답 201**
```json
{
  "data": {
    "couple_id": "uuid",
    "message": "커플 공간에 참여했습니다."
  }
}
```

**오류**
- `404` — 유효하지 않은 초대 코드
- `409 ALREADY_IN_COUPLE` — 이미 다른 커플 공간에 참여 중
- `409 COUPLE_FULL` — 커플 공간이 이미 2명

---

## Diaries (일기)

### GET /diaries

커플 공간의 전체 일기 목록을 반환한다. 최신 날짜 순. 삭제된 일기 제외.

**응답**
```json
{
  "data": [
    {
      "id": "uuid",
      "couple_id": "uuid",
      "author_id": "uuid",
      "title": "오늘의 기록",
      "content": "오늘 같이 산책해서 좋았다.",
      "diary_date": "2026-05-17",
      "mood": "happy",
      "tags": ["산책", "데이트"],
      "created_at": "2026-05-17T13:00:00Z",
      "updated_at": "2026-05-17T13:00:00Z",
      "deleted_at": null,
      "diary_images": [
        {
          "id": "uuid",
          "diary_id": "uuid",
          "couple_id": "uuid",
          "uploader_id": "uuid",
          "cloudinary_public_id": "diary/couple-id/image1",
          "secure_url": "https://res.cloudinary.com/dnnwfr7of/image/upload/...",
          "sort_order": 0,
          "created_at": "2026-05-17T13:00:00Z"
        }
      ]
    }
  ]
}
```

---

### POST /diaries

일기를 작성한다. `couple_id`와 `author_id`는 서버가 자동으로 설정한다. (클라이언트 값 무시)

**요청 바디**
```json
{
  "title": "오늘의 기록",
  "content": "오늘 같이 산책해서 좋았다.",
  "diary_date": "2026-05-17",
  "mood": "happy",
  "tags": ["산책", "데이트"],
  "images": [
    {
      "cloudinary_public_id": "diary/uuid/sample",
      "secure_url": "https://res.cloudinary.com/dnnwfr7of/image/upload/...",
      "sort_order": 0
    }
  ]
}
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `title` | string (max 200) | ✅ | 제목 |
| `content` | string | ✅ | 본문 |
| `diary_date` | string `YYYY-MM-DD` | ✅ | 일기 날짜. 오늘 이전만 허용 |
| `mood` | string | ✅ | `happy` `love` `calm` `sad` `tired` 중 하나 |
| `tags` | string[] | ❌ | 태그 목록 |
| `images` | Image[] | ❌ | 첨부 이미지 최대 3장 |

**Image 객체**

| 필드 | 타입 | 필수 |
|------|------|------|
| `cloudinary_public_id` | string | ✅ |
| `secure_url` | string (URL) | ✅ |
| `sort_order` | number | ❌ |

**이미지 업로드 순서**
1. `POST /uploads/cloudinary-signature` 로 서명 발급
2. Cloudinary에 직접 업로드 → `secure_url`, `public_id` 획득
3. 이 API의 `images` 배열에 포함해서 전송

**응답 201** — 생성된 일기 객체 + `diary_images` 배열

> 파트너에게 `diary_created` 알림이 자동 생성된다.

---

### GET /diaries/:id

단일 일기를 이미지 + 댓글 + 이모지 반응과 함께 반환한다.

**응답**
```json
{
  "data": {
    "id": "uuid",
    "couple_id": "uuid",
    "author_id": "uuid",
    "title": "오늘의 기록",
    "content": "오늘 같이 산책해서 좋았다.",
    "diary_date": "2026-05-17",
    "mood": "happy",
    "tags": ["산책"],
    "created_at": "2026-05-17T13:00:00Z",
    "updated_at": "2026-05-17T13:00:00Z",
    "deleted_at": null,
    "diary_images": [ ... ],
    "comments": [ ... ],
    "diary_reactions": [ ... ]
  }
}
```

---

### PATCH /diaries/:id

일기를 수정한다. **작성자 본인만 가능.**

**요청 바디** — 변경할 필드만 포함
```json
{
  "title": "수정된 제목",
  "content": "수정된 본문",
  "diary_date": "2026-05-16",
  "mood": "calm",
  "tags": ["카페"],
  "images": [ ... ]
}
```

> `images` 를 포함하면 기존 이미지를 **전체 교체**한다.
> `images` 를 포함하지 않으면 기존 이미지를 유지한다.
> 빈 배열 `[]` 을 보내면 이미지를 전부 삭제한다.

**응답** — 수정된 일기 객체 + `diary_images`

**오류**
- `403 FORBIDDEN` — 본인 일기가 아님
- `404` — 일기 없음

---

### DELETE /diaries/:id

일기를 삭제한다. **작성자 본인만 가능.** Soft delete.

**응답**
```json
{
  "data": { "message": "일기가 삭제되었습니다." }
}
```

**오류**
- `403 FORBIDDEN` — 본인 일기가 아님
- `404` — 일기 없음

---

## Uploads (Cloudinary 서명)

### POST /uploads/cloudinary-signature

Cloudinary signed upload에 필요한 서명 정보를 반환한다.

> Cloudinary API secret은 절대 응답에 포함되지 않는다.

**응답**
```json
{
  "data": {
    "signature": "2109fdea3a0631d3281595d2c6280b740f81e801",
    "timestamp": 1779027733,
    "apiKey": "348452336941221",
    "cloudName": "dnnwfr7of",
    "folder": "diary/{coupleId}"
  }
}
```

**프론트엔드 업로드 코드**
```js
// 1. 백엔드에서 서명 발급
const { data: sig } = await api.post('/uploads/cloudinary-signature');

// 2. FormData 구성 (folder + timestamp + signature + api_key만 포함)
const formData = new FormData();
formData.append('file', file);
formData.append('api_key', sig.apiKey);
formData.append('timestamp', String(sig.timestamp));
formData.append('signature', sig.signature);
formData.append('folder', sig.folder);

// 3. Cloudinary에 직접 업로드
const res = await fetch(
  `https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`,
  { method: 'POST', body: formData }
);
const { secure_url, public_id } = await res.json();

// 4. secure_url, public_id를 일기 생성 API에 포함
```

> 업로드 제한 (프론트엔드에서 검증)
> - 허용 확장자: `jpg`, `jpeg`, `png`, `webp`
> - 최대 파일 크기: 10MB
> - 일기당 최대 3장

---

## Comments (댓글)

### GET /diaries/:diaryId/comments

일기의 댓글 목록을 작성 순으로 반환한다. 삭제된 댓글 제외.

**응답**
```json
{
  "data": [
    {
      "id": "uuid",
      "diary_id": "uuid",
      "couple_id": "uuid",
      "author_id": "uuid",
      "content": "오늘도 수고했어 ❤️",
      "created_at": "2026-05-17T14:00:00Z",
      "updated_at": "2026-05-17T14:00:00Z",
      "deleted_at": null
    }
  ]
}
```

---

### POST /diaries/:diaryId/comments

댓글을 작성한다.

**요청 바디**
```json
{
  "content": "오늘도 수고했어 ❤️"
}
```

**응답 201** — 생성된 댓글 객체

---

### PATCH /comments/:commentId

댓글을 수정한다. **본인 댓글만 가능.**

**요청 바디**
```json
{
  "content": "수정된 댓글"
}
```

**응답** — 수정된 댓글 객체

---

### DELETE /comments/:commentId

댓글을 삭제한다. **본인 댓글만 가능.** Soft delete.

**응답**
```json
{
  "data": { "message": "댓글이 삭제되었습니다." }
}
```

---

## Reactions (이모지 반응)

허용 이모지: `❤️` `🥰` `😂` `😢` `👏`

### PUT /diaries/:diaryId/reaction

이모지 반응을 추가/변경/취소한다. 일기당 사용자 1개만 가능.

| 상황 | 동작 |
|------|------|
| 반응 없음 | 생성 (201) |
| 반응 있고 **다른 이모지** | 변경 (200) |
| 반응 있고 **같은 이모지** | 취소 (200, `cancelled: true`) |

**요청 바디**
```json
{
  "emoji": "❤️"
}
```

**응답 — 반응 생성/변경 시**
```json
{
  "data": {
    "id": "uuid",
    "diary_id": "uuid",
    "user_id": "uuid",
    "emoji": "❤️",
    "created_at": "2026-05-17T15:00:00Z",
    "updated_at": "2026-05-17T15:00:00Z"
  }
}
```

**응답 — 반응 취소 시**
```json
{
  "data": { "cancelled": true, "emoji": "❤️" }
}
```

---

### DELETE /diaries/:diaryId/reaction

본인의 반응을 명시적으로 취소한다.

**응답**
```json
{
  "data": { "message": "반응이 취소되었습니다." }
}
```

---

## Calendar (캘린더)

### GET /calendar?year=2026&month=5

해당 월의 날짜별 일기 현황을 반환한다.

**쿼리 파라미터**

| 파라미터 | 타입 | 필수 | 예시 |
|----------|------|------|------|
| `year` | number | ✅ | `2026` |
| `month` | number 1–12 | ✅ | `5` |

**응답**
```json
{
  "data": {
    "year": 2026,
    "month": 5,
    "today": "2026-05-17",
    "days": [
      {
        "date": "2026-05-17",
        "my_count": 1,
        "partner_count": 1,
        "moods": ["happy", "love"],
        "has_images": true
      },
      {
        "date": "2026-05-10",
        "my_count": 1,
        "partner_count": 0,
        "moods": ["calm"],
        "has_images": false
      }
    ]
  }
}
```

> `days` 는 일기가 존재하는 날짜만 포함한다. 일기 없는 날짜는 배열에 없다.
> `today` 로 미래 날짜를 프론트에서 비활성화할 수 있다.

---

## Memories (추억)

### GET /memories/photos

커플 공간의 사진을 최신순으로 반환한다. 삭제된 일기의 사진은 포함되지 않는다.

**쿼리 파라미터**

| 파라미터 | 기본값 | 최대 |
|----------|--------|------|
| `limit` | `50` | `100` |
| `offset` | `0` | — |

**응답**
```json
{
  "data": {
    "total": 12,
    "offset": 0,
    "limit": 50,
    "photos": [
      {
        "id": "uuid",
        "secure_url": "https://res.cloudinary.com/dnnwfr7of/image/upload/...",
        "cloudinary_public_id": "diary/uuid/sample",
        "sort_order": 0,
        "created_at": "2026-05-17T13:00:00Z",
        "diary": {
          "id": "uuid",
          "title": "오늘의 기록",
          "diary_date": "2026-05-17",
          "author": {
            "id": "uuid",
            "display_name": "홍길동",
            "avatar_url": null
          }
        }
      }
    ]
  }
}
```

---

### GET /memories/timeline

일기를 월별로 그룹화해서 최신 월부터 반환한다.

**쿼리 파라미터**

| 파라미터 | 기본값 | 최대 |
|----------|--------|------|
| `limit` | `50` | `100` |
| `offset` | `0` | — |

**응답**
```json
{
  "data": {
    "timeline": [
      {
        "month": "2026-05",
        "diaries": [
          {
            "id": "uuid",
            "title": "오늘의 기록",
            "diary_date": "2026-05-17",
            "mood": "happy",
            "tags": ["산책"],
            "thumbnail_url": "https://res.cloudinary.com/dnnwfr7of/image/upload/...",
            "author": {
              "id": "uuid",
              "display_name": "홍길동",
              "avatar_url": null
            }
          }
        ]
      },
      {
        "month": "2026-04",
        "diaries": [ ... ]
      }
    ]
  }
}
```

> `thumbnail_url` 은 일기 첫 번째 이미지의 `secure_url`. 이미지 없는 일기는 `null`.

---

## Anniversary (기념일)

### GET /anniversary

사귄 날짜 기반 D-Day 정보와 기념일 목록을 반환한다.

**응답 — started_on 설정된 경우**
```json
{
  "data": {
    "started_on": "2025-01-01",
    "day_count": 502,
    "today": "2026-05-17",
    "next_milestone": {
      "day_count": 600,
      "date": "2026-08-24",
      "days_left": 98
    },
    "milestones": [
      { "label": "100일", "date": "2025-04-11", "day_count": 100, "is_past": true },
      { "label": "200일", "date": "2025-07-20", "day_count": 200, "is_past": true },
      { "label": "300일", "date": "2025-10-28", "day_count": 300, "is_past": true },
      { "label": "400일", "date": "2026-02-05", "day_count": 400, "is_past": true },
      { "label": "500일", "date": "2026-05-16", "day_count": 500, "is_past": true },
      { "label": "600일", "date": "2026-08-24", "day_count": 600, "is_past": false },
      { "label": "700일", "date": "2026-12-02", "day_count": 700, "is_past": false },
      { "label": "800일", "date": "2027-03-12", "day_count": 800, "is_past": false }
    ],
    "anniversaries": [
      {
        "id": "uuid",
        "title": "처음 만난 날",
        "date": "2024-12-01",
        "type": "custom",
        "created_by": "uuid"
      }
    ]
  }
}
```

**응답 — started_on 미설정 시**
```json
{
  "data": {
    "started_on": null,
    "day_count": null,
    "today": "2026-05-17",
    "next_milestone": null,
    "anniversaries": []
  }
}
```

---

### PATCH /anniversary

사귄 날짜를 수정한다. 커플 공간의 두 사람 모두 수정 가능.

**요청 바디**
```json
{
  "started_on": "2025-01-01"
}
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `started_on` | string `YYYY-MM-DD` 또는 `null` | ✅ | `null` 을 보내면 날짜 초기화 |

**응답** — 수정된 커플 정보 + D-Day 재계산 결과
```json
{
  "data": {
    "id": "uuid",
    "name": "우리 커플",
    "started_on": "2025-01-01",
    "today": "2026-05-17",
    "day_count": 502,
    "next_milestone": {
      "day_count": 600,
      "date": "2026-08-24",
      "days_left": 98
    }
  }
}
```

---

## Notifications (알림)

### GET /notifications

내 알림 목록을 최신순으로 반환한다.

**응답**
```json
{
  "data": [
    {
      "id": "uuid",
      "couple_id": "uuid",
      "recipient_id": "uuid",
      "actor_id": "uuid",
      "type": "diary_created",
      "target_diary_id": "uuid",
      "message": "새로운 일기가 작성되었습니다: \"오늘의 기록\"",
      "read_at": null,
      "created_at": "2026-05-17T13:00:00Z"
    }
  ]
}
```

| `type` | 발생 시점 |
|--------|-----------|
| `diary_created` | 파트너가 새 일기 작성 |
| `comment_created` | 파트너가 댓글 작성 (미구현) |
| `reaction_created` | 파트너가 이모지 반응 (미구현) |

---

### PATCH /notifications/:id/read

알림을 읽음 처리한다. 이미 읽은 알림은 그대로 반환한다.

**응답** — 업데이트된 알림 객체 (`read_at`이 채워짐)

---

## 사용 흐름 요약

```
1. 회원가입 / 로그인          → Supabase Auth (프론트엔드 직접)
2. 프로필 조회/수정           → GET /me, PATCH /me
3. 커플 공간 생성             → POST /couples          (invite_code 발급)
4. 파트너가 초대 코드로 참여  → POST /couples/join
5. 커플 공간 조회             → GET /couples/me
6. 이미지 업로드 서명 발급    → POST /uploads/cloudinary-signature
7. Cloudinary에 직접 업로드  → Cloudinary API (프론트에서 직접)
8. 일기 작성                  → POST /diaries
9. 일기 목록                  → GET /diaries
10. 캘린더                    → GET /calendar?year=2026&month=5
11. 댓글                      → POST /diaries/:id/comments
12. 이모지 반응               → PUT /diaries/:id/reaction
13. 추억 사진                 → GET /memories/photos
14. 타임라인                  → GET /memories/timeline
15. 기념일                    → GET /anniversary, PATCH /anniversary
16. 알림                      → GET /notifications, PATCH /notifications/:id/read
```
