import { Router } from 'express';
import meRouter                              from './me';
import couplesRouter                         from './couples';
import diariesRouter                         from './diaries';
import uploadsRouter                         from './uploads';
import { diaryCommentsRouter, commentOpsRouter } from './comments';
import { reactionsRouter }                   from './reactions';
import notificationsRouter                   from './notifications';
import calendarRouter                        from './calendar';
import memoriesRouter                        from './memories';
import anniversaryRouter                     from './anniversary';

const router = Router();

router.use('/me',            meRouter);
router.use('/couples',       couplesRouter);

// 일기: GET /, POST /, GET /:id, PATCH /:id, DELETE /:id
router.use('/diaries',       diariesRouter);

// 댓글: GET /diaries/:diaryId/comments, POST /diaries/:diaryId/comments
router.use('/diaries',       diaryCommentsRouter);

// 댓글 개별 작업: PATCH /comments/:commentId, DELETE /comments/:commentId
router.use('/comments',      commentOpsRouter);

// 이모지 반응: PUT /diaries/:diaryId/reaction, DELETE /diaries/:diaryId/reaction
router.use('/diaries',       reactionsRouter);

// 이미지 업로드 서명: POST /uploads/cloudinary-signature
router.use('/uploads',       uploadsRouter);

// 알림: GET /notifications, PATCH /notifications/:id/read
router.use('/notifications', notificationsRouter);

// 캘린더: GET /calendar?year=&month=
router.use('/calendar',      calendarRouter);

// 추억: GET /memories/photos, GET /memories/timeline
router.use('/memories',      memoriesRouter);

// 기념일: GET /anniversary, PATCH /anniversary
router.use('/anniversary',   anniversaryRouter);

export default router;
