import api from '../utils/axios';

// Phase 1 direct-upload API surface. No form imports this yet — Phase 2+
// wires it per surface. Controllers never trust these responses for
// authorization; the backend re-validates ownership/state at commit.
export const createUploadSession = async ({ scope, ref } = {}) => {
  const { data } = await api.post('/uploads/session', { scope, ref });
  return data; // { success, session: { sessionId, scope, status, expiresAt } }
};

export const signUpload = async ({ sessionId, purpose, mediaKind, docType, planId, installmentNo } = {}) => {
  const { data } = await api.post('/uploads/sign', {
    sessionId,
    purpose,
    mediaKind,
    docType,
    planId,
    installmentNo,
  });
  return data; // { success, upload: { uploadId, cloudName, apiKey, signature, ... } }
};

export const completeUpload = async (uploadId, meta = {}) => {
  const { data } = await api.post(`/uploads/${uploadId}/complete`, meta);
  return data; // { success, upload }
};

export const commitUploads = async ({ sessionId, uploadIds, entityType, entityId, closeSession } = {}) => {
  const { data } = await api.post('/uploads/commit', {
    sessionId,
    uploadIds,
    entityType,
    entityId,
    closeSession,
  });
  return data; // { success, uploads }
};

export const deleteUpload = async (uploadId) => {
  const { data } = await api.delete(`/uploads/${uploadId}`);
  return data; // { success, upload }
};

export const getUploadViewUrl = async (uploadId) => {
  const { data } = await api.get(`/uploads/view/${uploadId}`);
  return data; // { success, url, deliveryType, expiresAt? }
};

// Direct browser → Cloudinary POST with progress. XHR (not fetch) because
// only XHR exposes upload.onprogress.
export const uploadFileToCloudinary = ({ signed, file, onProgress, signal } = {}) =>
  new Promise((resolve, reject) => {
    const endpoint =
      signed.resourceType === 'video'
        ? `https://api.cloudinary.com/v1_1/${signed.cloudName}/video/upload`
        : `https://api.cloudinary.com/v1_1/${signed.cloudName}/image/upload`;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('api_key', signed.apiKey);
    fd.append('timestamp', String(signed.timestamp));
    fd.append('folder', signed.folder);
    fd.append('public_id', signed.publicId);
    fd.append('resource_type', signed.resourceType);
    fd.append('overwrite', 'false');
    fd.append('allowed_formats', signed.allowedFormats.join(','));
    if (signed.deliveryType === 'private') fd.append('type', 'private');
    fd.append('signature', signed.signature);

    const xhr = new XMLHttpRequest();
    const onAbort = () => xhr.abort();
    if (signal) {
      if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
      signal.addEventListener('abort', onAbort, { once: true });
    }
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      signal?.removeEventListener('abort', onAbort);
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error('Invalid response from image server'));
        }
      } else {
        reject(new Error(`Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => {
      signal?.removeEventListener('abort', onAbort);
      reject(new Error('Network error during upload'));
    };
    xhr.onabort = () => {
      signal?.removeEventListener('abort', onAbort);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    xhr.open('POST', endpoint);
    xhr.send(fd);
  });
