import express, { Request, Response, NextFunction } from 'express';
import cors    from 'cors';
import helmet  from 'helmet';
import { env }    from './config/env';
import router  from './routes';

const app = express();

app.use(helmet());

// FRONTEND_ORIGIN 은 쉼표로 구분해서 여러 origin을 허용할 수 있다.
// 예: FRONTEND_ORIGIN=http://localhost:3001,https://my-app.vercel.app
const allowedOrigins = env.FRONTEND_ORIGIN.split(',').map((o) => o.trim());
app.use(
  cors({
    origin: (origin, callback) => {
      // origin 없는 요청 (서버 간 직접 호출, curl 등)은 허용
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin '${origin}' is not allowed`));
      }
    },
    credentials: true,
    allowedHeaders: ['Authorization', 'Content-Type'],
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  }),
);
app.use(express.json());

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

app.use('/', router);

// 404 핸들러
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: '요청한 경로를 찾을 수 없습니다.' },
  });
});

// 전역 에러 핸들러
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[ERROR]', err);
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.' },
  });
});

export default app;
