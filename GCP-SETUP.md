# GCP Cloud Run 배포 - 완벽 가이드

## 📋 사전 요구사항

- GCP 계정
- 신용카드 (무료 크레딧 $300/3개월)
- macOS (brew 설치됨)

---

## 🔧 Step 1: GCP 프로젝트 생성

### 1.1 GCP 콘솔 접속
```
https://console.cloud.google.com
```

### 1.2 새 프로젝트 생성
1. 상단의 **프로젝트 선택** 클릭
2. **새 프로젝트** 버튼 클릭
3. 프로젝트 이름: `diary-api` 입력
4. 조직: (선택 사항) → **만들기** 클릭
5. 프로젝트 생성 완료 대기 (1-2분)

### 1.3 PROJECT_ID 확인
- 생성된 프로젝트 대시보드에서 PROJECT_ID 확인
- 형식: `diary-api-abc123xyz` (프로젝트 이름과 다를 수 있음)
- 이 ID는 나중에 자주 사용됨

---

## 💳 Step 2: 결제 설정 (필수)

⚠️ **Cloud Run 사용 전 결제 활성화 필요**

1. 좌측 메뉴 → **결제** 클릭
2. **결제 계정 연결** 클릭
3. **새 결제 계정** 선택
4. 신용카드 정보 입력
5. 결제 계정 활성화

**무료 크레딧:**
- $300/3개월 제공
- 무료 이용 범위: 월 200만 요청

---

## 🚀 Step 3: CLI 설정 (터미널)

### 3.1 Google Cloud SDK 설치
```bash
brew install google-cloud-sdk
```

### 3.2 GCP 로그인
```bash
gcloud auth login
```
- 브라우저가 열리면 Google 계정 선택
- 접근 권한 승인

### 3.3 기본 프로젝트 설정
```bash
# PROJECT_ID를 위에서 확인한 ID로 변경
gcloud config set project diary-api-abc123xyz

# 기본 리전 설정 (한국 - 낮은 레이턴시)
gcloud config set compute/region asia-northeast3

# 설정 확인
gcloud config list
```

---

## 🏗️ Step 4: 필요한 API 활성화

### 4.1 자동 활성화 (권장)
```bash
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudresourcemanager.googleapis.com \
  compute.googleapis.com
```

### 4.2 수동 활성화 (대안)
GCP 콘솔에서:
1. 좌측 메뉴 → **API 및 서비스** → **API 라이브러리**
2. 다음 API 검색 후 각각 **활성화**:
   - Cloud Run API
   - Artifact Registry API
   - Cloud Build API
   - Cloud Resource Manager API

---

## 📦 Step 5: Artifact Registry 설정

### 5.1 저장소 생성 (처음 한 번)
```bash
gcloud artifacts repositories create diary-back \
  --repository-format=docker \
  --location=asia-northeast3 \
  --description="Diary Backend API"
```

### 5.2 Docker 인증 설정
```bash
gcloud auth configure-docker asia-northeast3-docker.pkg.dev
```

### 5.3 저장소 확인 (GCP 콘솔)
1. **Artifact Registry** → **저장소**
2. `diary-back` 저장소가 보이면 성공

---

## 🔐 Step 6: IAM 권한 확인

일반적으로 프로젝트 소유자는 모든 권한이 있습니다.
필요시 확인:

1. GCP 콘솔 → **IAM 및 관리자** → **IAM**
2. 로그인한 이메일을 찾아 역할 확인:
   - ✅ `편집자` 또는 `소유자` 필요
   - ❌ `뷰어` 권한만 있으면 배포 불가

---

## 📝 Step 7: 환경변수 준비

배포 전 확인:

```bash
# .env 파일이 프로젝트 루트에 있는지 확인
cat /Users/jeonseongpyo/Desktop/diary-back/.env

# 필요한 환경변수:
# ✅ SUPABASE_URL
# ✅ SUPABASE_ANON_KEY
# ✅ SUPABASE_SERVICE_ROLE_KEY
# ✅ CLOUDINARY_CLOUD_NAME
# ✅ CLOUDINARY_API_KEY
# ✅ CLOUDINARY_API_SECRET
# ✅ FRONTEND_ORIGIN (프로덕션: https://your-frontend.com)
# ✅ NODE_ENV=production
```

---

## 🚀 Step 8: Cloud Run 배포

### 옵션 A: 자동 배포 (추천)

```bash
cd /Users/jeonseongpyo/Desktop/diary-back

gcloud run deploy diary-back \
  --source . \
  --platform managed \
  --region asia-northeast3 \
  --memory 512Mi \
  --cpu 1 \
  --timeout 3600 \
  --allow-unauthenticated \
  --set-env-vars "SUPABASE_URL=$(grep SUPABASE_URL .env | cut -d= -f2),\
SUPABASE_ANON_KEY=$(grep SUPABASE_ANON_KEY .env | cut -d= -f2),\
SUPABASE_SERVICE_ROLE_KEY=$(grep SUPABASE_SERVICE_ROLE_KEY .env | cut -d= -f2),\
CLOUDINARY_CLOUD_NAME=$(grep CLOUDINARY_CLOUD_NAME .env | cut -d= -f2),\
CLOUDINARY_API_KEY=$(grep CLOUDINARY_API_KEY .env | cut -d= -f2),\
CLOUDINARY_API_SECRET=$(grep CLOUDINARY_API_SECRET .env | cut -d= -f2),\
CLOUDINARY_UPLOAD_FOLDER=$(grep CLOUDINARY_UPLOAD_FOLDER .env | cut -d= -f2),\
FRONTEND_ORIGIN=$(grep FRONTEND_ORIGIN .env | cut -d= -f2),\
NODE_ENV=production"
```

### 옵션 B: GCP 콘솔에서 배포 후 환경변수 설정

```bash
# 배포만
gcloud run deploy diary-back \
  --source . \
  --platform managed \
  --region asia-northeast3 \
  --allow-unauthenticated
```

그 후 GCP 콘솔에서:
1. **Cloud Run** → **diary-back** 클릭
2. **수정 및 배포** 클릭
3. **컨테이너** 탭 → **환경 변수** 섹션
4. 각 환경변수 추가:

| 이름 | 값 |
|------|-----|
| SUPABASE_URL | (복사) |
| SUPABASE_ANON_KEY | (복사) |
| SUPABASE_SERVICE_ROLE_KEY | (복사) |
| CLOUDINARY_CLOUD_NAME | (복사) |
| CLOUDINARY_API_KEY | (복사) |
| CLOUDINARY_API_SECRET | (복사) |
| CLOUDINARY_UPLOAD_FOLDER | diary |
| FRONTEND_ORIGIN | https://your-frontend.com |
| NODE_ENV | production |
| PORT | 8080 |

5. **배포** 클릭

---

## ✅ Step 9: 배포 완료 확인

### 9.1 CLI에서 확인
```bash
# 배포 상태 확인
gcloud run services describe diary-back \
  --region asia-northeast3

# 출력에서 URL 찾기:
# Service URL: https://diary-back-xxxxx-an.a.run.app
```

### 9.2 GCP 콘솔에서 확인
1. **Cloud Run** 메뉴 클릭
2. **diary-back** 서비스 클릭
3. 상단의 **서비스 URL** 복사
4. 브라우저에서 열기 → 연결 테스트

### 9.3 API 테스트
```bash
# 배포된 URL로 테스트
curl https://diary-back-xxxxx-an.a.run.app/api/health

# 또는 포스트맨에서:
# GET https://diary-back-xxxxx-an.a.run.app/health
```

---

## 📊 Step 10: 모니터링 & 로그

### 로그 확인 (CLI)
```bash
# 최근 50줄
gcloud run services logs read diary-back \
  --region asia-northeast3 \
  --limit 50

# 실시간 로그
gcloud run services logs read diary-back \
  --region asia-northeast3 \
  --follow
```

### GCP 콘솔에서
1. **Cloud Run** → **diary-back**
2. **로그** 탭 클릭
3. 실시간 로그 확인

---

## 🌐 Step 11: 커스텀 도메인 연결 (선택사항)

예: `api.yourdomain.com` → Cloud Run 서비스

### 11.1 도메인 등록 확인
- 도메인을 소유해야 함 (예: GoDaddy, 가비아 등)

### 11.2 도메인 매핑 생성
```bash
gcloud run domain-mappings create \
  --service=diary-back \
  --domain=api.yourdomain.com \
  --region=asia-northeast3
```

### 11.3 DNS 레코드 추가
```bash
# DNS 정보 확인
gcloud run domain-mappings describe api.yourdomain.com

# 출력 예:
# DNS Target: ghs.googlehosted.com
```

DNS 공급자에서 (GoDaddy, 가비아 등):
1. **CNAME 레코드** 추가:
   - 호스트: `api`
   - 값: `ghs.googlehosted.com`
2. 저장 후 5-30분 대기 (DNS 전파)

### 11.4 확인
```bash
# 몇 분 후 테스트
curl https://api.yourdomain.com/health
```

---

## 💰 Step 12: 비용 관리

### 무료 사용량
- 월 200만 요청 무료
- 월 360,000 GB-초 무료

### 비용 절감 팁

```bash
# 1. CPU 절감 (요청 중에만 사용)
gcloud run services update diary-back \
  --region asia-northeast3 \
  --cpu-throttling

# 2. 인스턴스 최소 개수 (콜드스타트 방지, 추가 비용)
# 필요시만 설정:
gcloud run services update diary-back \
  --region asia-northeast3 \
  --min-instances 0

# 3. 메모리 줄이기 (필요시)
gcloud run services update diary-back \
  --region asia-northeast3 \
  --memory 256Mi
```

### 비용 모니터링
1. **결제** → **비용 분석**
2. Cloud Run 필터 적용
3. 실시간 비용 확인

---

## 🐛 문제 해결

### 배포 실패 - "Container failed to start"
```bash
# 로그 확인
gcloud run services logs read diary-back --region asia-northeast3 --limit 100

# 가능한 원인:
# 1. PORT 포트 맞는지 확인 (8080 권장)
# 2. 환경변수 누락 확인
# 3. Dockerfile 구문 오류 확인
```

### 접근 불가 - "403 Permission Denied"
```bash
# IAM 권한 확인
gcloud projects get-iam-policy YOUR_PROJECT_ID

# 필요시 권한 추가 (관리자만)
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member=user:your-email@gmail.com \
  --role=roles/run.admin
```

### 느린 응답
```bash
# 메모리 증가 (512Mi → 1Gi)
gcloud run services update diary-back \
  --region asia-northeast3 \
  --memory 1Gi

# 최소 인스턴스 설정 (콜드스타트 방지)
gcloud run services update diary-back \
  --region asia-northeast3 \
  --min-instances 1
```

### 환경변수 누락
```bash
# 현재 환경변수 확인
gcloud run services describe diary-back \
  --region asia-northeast3

# 환경변수 업데이트
gcloud run services update diary-back \
  --region asia-northeast3 \
  --update-env-vars KEY=VALUE,KEY2=VALUE2
```

---

## 🎯 배포 완료 체크리스트

- [ ] GCP 계정 생성 및 결제 활성화
- [ ] gcloud CLI 설치 및 로그인
- [ ] 프로젝트 생성 (PROJECT_ID 확인)
- [ ] Cloud Run API 활성화
- [ ] Artifact Registry 생성
- [ ] Docker 인증 설정
- [ ] 환경변수 .env 파일 준비
- [ ] Cloud Run 배포 실행
- [ ] 배포된 URL에서 API 테스트
- [ ] 환경변수 모두 설정 확인
- [ ] 로그에서 오류 없는지 확인
- [ ] (선택) 커스텀 도메인 연결

---

## 📚 유용한 명령어 모음

```bash
# 배포 상태 조회
gcloud run services describe diary-back --region asia-northeast3

# 배포된 모든 서비스 목록
gcloud run services list --region asia-northeast3

# 로그 확인 (최근 50줄)
gcloud run services logs read diary-back --region asia-northeast3 --limit 50

# 실시간 로그
gcloud run services logs read diary-back --region asia-northeast3 --follow

# 환경변수 업데이트
gcloud run services update diary-back --region asia-northeast3 --update-env-vars KEY=VALUE

# 서비스 삭제
gcloud run services delete diary-back --region asia-northeast3

# 도메인 매핑 조회
gcloud run domain-mappings list

# 저장소 목록
gcloud artifacts repositories list --location=asia-northeast3
```

---

## 🔗 참고 링크

- [Google Cloud Run 공식 문서](https://cloud.google.com/run/docs)
- [Cloud Run 가격](https://cloud.google.com/run/pricing)
- [gcloud CLI 참고](https://cloud.google.com/sdk/gcloud)
- [Node.js on Cloud Run 가이드](https://cloud.google.com/run/docs/quickstarts/build-and-deploy/nodejs)
