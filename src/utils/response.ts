import { Response } from 'express';

export function sendSuccess<T>(res: Response, data: T, status = 200): Response {
  return res.status(status).json({ data });
}

export function sendError(
  res: Response,
  status: number,
  code: string,
  message: string,
): Response {
  return res.status(status).json({ error: { code, message } });
}

export function sendBadRequest(res: Response, message = '잘못된 요청입니다.'): Response {
  return sendError(res, 400, 'BAD_REQUEST', message);
}

export function sendUnauthorized(res: Response, message = '인증이 필요합니다.'): Response {
  return sendError(res, 401, 'UNAUTHORIZED', message);
}

export function sendForbidden(res: Response, message = '권한이 없습니다.'): Response {
  return sendError(res, 403, 'FORBIDDEN', message);
}

export function sendNotFound(res: Response, message = '리소스를 찾을 수 없습니다.'): Response {
  return sendError(res, 404, 'NOT_FOUND', message);
}

export function sendInternalError(res: Response, message = '서버 오류가 발생했습니다.'): Response {
  return sendError(res, 500, 'INTERNAL_ERROR', message);
}
