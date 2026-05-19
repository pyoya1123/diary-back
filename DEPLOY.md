# GCP Cloud Run 배포 가이드

## 사전 준비

### 1. GCP 프로젝트 설정
```bash
# GCP CLI 설치 (macOS)
brew install google-cloud-sdk

# GCP 로그인
gcloud auth login

# 프로젝트 설정 (프로젝트 ID 필수)
gcloud config set project YOUR_PROJECT_ID
```

### 2. Artifact Registry 설정
```bash
# Artifact Registry 활성화
gcloud services enable artifactregistry.googleapis.com

# 리포지토리 생성 (서울 리전)
gcloud artifacts repositories create diary-back \
  --repository-format=docker \
  --location=asia-northeast3 \
  --description="Diary Back API Repository"

# 인증 설정
gcloud auth configure-docker asia-northeast3-docker.pkg.dev
```

## 배포 방법

### 옵션 A: 자동 배포 (추천)
```bash
cd /Users/jeonseongpyo/Desktop/diary-back

# 환경변수 .env 파일 확인
# (주요: SUPABASE_URL, SUPABASE_ANON_KEY, FRONTEND_ORIGIN 등)

# Cloud Run에 배포
gcloud run deploy diary-back \
  --source . \
  --platform managed \
  --region asia-northeast3 \
  --memory 512Mi \
  --cpu 1 \
  --timeout 3600 \
  --allow-unauthenticated \
  --set-env-vars "$(cat .env | grep -v '^#' | xargs)"
```

### 옵션 B: 수동 빌드 후 배포
```bash
# 1. 이미지 빌드
docker build -t diary-back:latest .

# 2. 태그 지정 (서울 리전, Artifact Registry)
docker tag diary-back:latest \
  asia-northeast3-docker.pkg.dev/YOUR_PROJECT_ID/diary-back/diary-back:latest

# 3. Docker 이미지 푸시
docker push \
  asia-northeast3-docker.pkg.dev/YOUR_PROJECT_ID/diary-back/diary-back:latest

# 4. Cloud Run 배포
gcloud run deploy diary-back \
  --image asia-northeast3-docker.pkg.dev/YOUR_PROJECT_ID/diary-back/diary-back:latest \
  --platform managed \
  --region asia-northeast3 \
  --memory 512Mi \
  --cpu 1 \
  --allow-unauthenticated
```

## 환경변수 설정

배포 후 환경변수를 Cloud Run 콘솔에서 수정:

```bash
# 또는 CLI로 업데이트
gcloud run services update diary-back \
  --region asia-northeast3 \
  --update-env-vars \
  SUPABASE_URL=YOUR_URL,\
  SUPABASE_ANON_KEY=YOUR_KEY,\
  FRONTEND_ORIGIN=https://your-frontend.com,\
  NODE_ENV=production,\
  CLOUDINARY_CLOUD_NAME=YOUR_NAME,\
  CLOUDINARY_API_KEY=YOUR_KEY,\
  CLOUDINARY_API_SECRET=YOUR_SECRET
```

## PORT 설정

⚠️ **중요**: 로컬에서는 `.env`의 `PORT=4000`을 사용하지만,  
Cloud Run은 자동으로 `PORT` 환경변수를 `8080`으로 설정합니다.

수동으로 변경하려면:
```bash
gcloud run services update diary-back \
  --region asia-northeast3 \
  --update-env-vars PORT=8080
```

## 배포 확인

```bash
# 배포된 서비스 확인
gcloud run services list --region asia-northeast3

# 서비스 상세 정보 (URL 포함)
gcloud run services describe diary-back --region asia-northeast3

# 로그 확인
gcloud run services logs read diary-back --region asia-northeast3 --limit 50

# 실시간 로그
gcloud run services logs read diary-back --region asia-northeast3 --follow
```

## 비용 절감 팁

```bash
# CPU를 요청 중에만 할당 (비용 절감)
gcloud run services update diary-back \
  --region asia-northeast3 \
  --cpu-throttling

# 최소 인스턴스 설정 (콜드스타트 방지, 추가 비용)
gcloud run services update diary-back \
  --region asia-northeast3 \
  --min-instances 1
```

## 커스텀 도메인 연결

```bash
# 1. 도메인 매핑 설정
gcloud run domain-mappings create \
  --service=diary-back \
  --domain=api.yourdomain.com \
  --region=asia-northeast3

# 2. DNS 레코드 추가 (표시된 DNS 정보로)
# Cloud Run이 제공하는 DNS 정보를 도메인 DNS 설정에 추가
```

## 문제 해결

### 배포 실패 시
```bash
# 로그 확인
gcloud run services logs read diary-back --region asia-northeast3 --limit 100

# 헬스체크 실패 - Dockerfile의 EXPOSE 포트가 8080인지 확인
# 환경변수 누락 - Cloud Run 콘솔에서 환경변수 다시 확인
```

### 로컬 테스트
```bash
# Docker로 로컬 테스트 (포트 8080 사용)
docker run -p 8080:8080 \
  -e SUPABASE_URL=YOUR_URL \
  -e SUPABASE_ANON_KEY=YOUR_KEY \
  -e FRONTEND_ORIGIN=http://localhost:3001 \
  diary-back:latest
```

## 참고

- [Google Cloud Run 공식 문서](https://cloud.google.com/run/docs)
- [Node.js on Cloud Run](https://cloud.google.com/run/docs/quickstarts/build-and-deploy/nodejs)
- 서울 리전 (`asia-northeast3`) 사용으로 낮은 레이턴시 보장
