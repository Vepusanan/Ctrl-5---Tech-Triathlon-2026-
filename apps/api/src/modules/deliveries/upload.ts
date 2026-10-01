import type { Multipart, MultipartFile } from '@fastify/multipart';
import { ApiError } from '../../plugins/errors.ts';
import type { PodUpload } from './apply.ts';

const TOO_LARGE = new Set(['FST_REQ_FILE_TOO_LARGE', 'FST_ERR_CTP_BODY_TOO_LARGE']);

export async function readPodUpload(parts: AsyncIterable<Multipart>): Promise<PodUpload> {
  const fields = new Map<string, string>();
  const files = new Map<string, Buffer>();
  try {
    for await (const part of parts) {
      if (part.type === 'file') {
        if (files.has(part.fieldname)) {
          throw new ApiError('VALIDATION_ERROR', `Duplicate file ${part.fieldname}`);
        }
        files.set(part.fieldname, await readFile(part));
      } else {
        if (typeof part.value !== 'string') {
          throw new ApiError('VALIDATION_ERROR', `Invalid field ${part.fieldname}`);
        }
        if (fields.has(part.fieldname)) {
          throw new ApiError('VALIDATION_ERROR', `Duplicate field ${part.fieldname}`);
        }
        fields.set(part.fieldname, part.value);
      }
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw uploadError(error);
  }

  const signature = files.get('signature');
  if (signature === undefined) throw new ApiError('VALIDATION_ERROR', 'Signature is required');
  const recipientName = fields.get('recipientName');
  if (recipientName === undefined) {
    throw new ApiError('VALIDATION_ERROR', 'Recipient name is required');
  }
  const clientTime = fields.get('clientTime');
  if (clientTime === undefined) throw new ApiError('VALIDATION_ERROR', 'Client time is required');

  const photo = files.get('photo');
  const upload: PodUpload = { recipientName, clientTime, signature };
  if (photo !== undefined) upload.photo = photo;
  return upload;
}

async function readFile(part: MultipartFile): Promise<Buffer> {
  try {
    return await part.toBuffer();
  } catch (error) {
    throw uploadError(error);
  }
}

function uploadError(error: unknown): ApiError {
  const code = errorCode(error);
  if (code !== null && TOO_LARGE.has(code)) {
    return new ApiError('VALIDATION_ERROR', 'Image must not exceed 2 MB');
  }
  if (code === 'FST_INVALID_MULTIPART_CONTENT_TYPE') {
    return new ApiError('VALIDATION_ERROR', 'Expected a multipart image upload');
  }
  if (error instanceof Error && error.message.length > 0) {
    return new ApiError('VALIDATION_ERROR', 'Invalid proof of delivery upload');
  }
  return new ApiError('VALIDATION_ERROR', 'Invalid proof of delivery upload');
}

function errorCode(error: unknown): string | null {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return error.code;
  }
  return null;
}
