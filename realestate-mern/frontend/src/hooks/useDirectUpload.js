import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  completeUpload,
  createUploadSession,
  deleteUpload,
  signUpload,
  uploadFileToCloudinary,
} from '../services/uploadService';

// Reusable direct-upload manager (Phase 1 infrastructure — NOT wired into
// any form yet; Phase 2+ adopts it per surface instead of duplicating
// progress/retry/concurrency logic).
//
// Flow per file: sign (backend) → PUT to Cloudinary (direct, with progress)
// → complete (backend). Entity submit later references uploadIds; the
// backend commits them (see services/uploadService commitUploads).
//
// Guarantees: configurable concurrency (default 3), per-file progress,
// queued/retry/cancel, failure isolation (one file never blocks others),
// overall progress, explicit pending/uploading/success/failed states.

export const FILE_STATES = {
  QUEUED: 'queued',
  SIGNING: 'signing',
  UPLOADING: 'uploading',
  COMPLETING: 'completing',
  SUCCESS: 'success',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

const MAX_RETRIES = 2;

let clientSeq = 0;
const nextClientId = () => `file-${Date.now()}-${clientSeq++}`;

export const useDirectUpload = ({ scope, concurrency = 3 } = {}) => {
  const [sessionId, setSessionId] = useState(null);
  const [files, setFiles] = useState([]); // [{ clientId, file, purpose, refs, status, progress, error, uploadId }]
  const filesRef = useRef([]);
  const controllersRef = useRef(new Map()); // clientId → AbortController
  const pumpRef = useRef(null);
  const optsRef = useRef({ scope, concurrency });
  optsRef.current = { scope, concurrency };

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  const patchFile = useCallback((clientId, patch) => {
    setFiles((prev) => prev.map((f) => (f.clientId === clientId ? { ...f, ...patch } : f)));
  }, []);

  // Single-file flows (avatar, slip) need to await one entry: resolves with
  // the uploadId on SUCCESS, rejects with the entry error on FAILED or
  // AbortError on cancellation/removal.
  const waitersRef = useRef(new Map());
  const waitFor = useCallback(
    (clientId) =>
      new Promise((resolve, reject) => {
        waitersRef.current.set(clientId, { resolve, reject });
      }),
    []
  );

  const ensureSession = useCallback(async () => {
    if (sessionId) return sessionId;
    const data = await createUploadSession({ scope: optsRef.current.scope });
    const id = data.session.sessionId;
    setSessionId(id);
    return id;
  }, [sessionId]);

  const runOne = useCallback(
    async (entry) => {
      const { clientId, file, purpose, refs } = entry;
      const controller = new AbortController();
      controllersRef.current.set(clientId, controller);
      try {
        patchFile(clientId, { status: FILE_STATES.SIGNING, progress: 0, error: '' });
        const sid = await ensureSession();
        const { upload } = await signUpload({ sessionId: sid, purpose, ...refs });
        if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
        patchFile(clientId, { status: FILE_STATES.UPLOADING, uploadId: upload.uploadId });
        const res = await uploadFileToCloudinary({
          signed: upload,
          file,
          signal: controller.signal,
          onProgress: (ratio) => patchFile(clientId, { progress: ratio }),
        });
        if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
        patchFile(clientId, { status: FILE_STATES.COMPLETING, progress: 1 });
        await completeUpload(upload.uploadId, {
          bytes: res.bytes,
          format: res.format,
          resourceType: res.resource_type,
          width: res.width,
          height: res.height,
          duration: res.duration,
        });
        patchFile(clientId, { status: FILE_STATES.SUCCESS, progress: 1 });
      } catch (err) {
        if (err?.name === 'AbortError' || controller.signal.aborted) {
          patchFile(clientId, { status: FILE_STATES.CANCELLED, error: 'Cancelled' });
        } else {
          // Read attempts live (a retry may have reset them after this run
          // snapshotted its entry).
          const live = filesRef.current.find((f) => f.clientId === clientId);
          const attempts = (live?.attempts || 0) + 1;
          if (attempts <= MAX_RETRIES) {
            patchFile(clientId, { attempts, status: FILE_STATES.QUEUED, error: '' });
          } else {
            patchFile(clientId, {
              attempts,
              status: FILE_STATES.FAILED,
              error: err?.response?.data?.message || err?.message || 'Upload failed',
            });
          }
        }
      } finally {
        controllersRef.current.delete(clientId);
        pumpRef.current?.();
      }
    },
    [ensureSession, patchFile]
  );

  // Queue pump: keep up to `concurrency` in flight. inFlightRef mirrors
  // outstanding runs so rapid pump invocations can't over-fill.
  const inFlightRef = useRef(new Set());
  const pump = useCallback(() => {
    const slots = Math.max(0, optsRef.current.concurrency - inFlightRef.current.size);
    if (slots === 0) return;
    const queued = filesRef.current
      .filter((f) => f.status === FILE_STATES.QUEUED && !inFlightRef.current.has(f.clientId))
      .slice(0, slots);
    queued.forEach((entry) => {
      inFlightRef.current.add(entry.clientId);
      setFiles((prev) =>
        prev.map((f) => (f.clientId === entry.clientId ? { ...f, status: FILE_STATES.SIGNING } : f))
      );
      runOne({ ...entry }).finally(() => inFlightRef.current.delete(entry.clientId));
    });
  }, [runOne]);
  pumpRef.current = pump;

  const addFiles = useCallback(
    (picked, { purpose, refs } = {}) => {
      const list = Array.isArray(picked) ? picked : [picked];
      const entries = list
        .filter(Boolean)
        .map((file) => ({ clientId: nextClientId(), file, purpose, refs: refs || {}, status: FILE_STATES.QUEUED, progress: 0, attempts: 0, error: '', uploadId: null }));
      if (entries.length === 0) return [];
      setFiles((prev) => [...prev, ...entries]);
      // Defer to next tick so filesRef has the new entries.
      setTimeout(() => pumpRef.current?.(), 0);
      return entries.map((e) => e.clientId);
    },
    []
  );

  const retry = useCallback((clientId) => {
    patchFile(clientId, { status: FILE_STATES.QUEUED, error: '', progress: 0, attempts: 0 });
    setTimeout(() => pumpRef.current?.(), 0);
  }, [patchFile]);

  const cancel = useCallback(
    async (clientId) => {
      controllersRef.current.get(clientId)?.abort();
      const waiter = waitersRef.current.get(clientId);
      if (waiter) {
        waitersRef.current.delete(clientId);
        waiter.reject(new DOMException('Aborted', 'AbortError'));
      }
      const entry = filesRef.current.find((f) => f.clientId === clientId);
      if (entry?.uploadId) {
        try {
          await deleteUpload(entry.uploadId);
        } catch {
          // Already expired/completed — sweeper owns the orphan either way.
        }
      }
      setFiles((prev) => prev.filter((f) => f.clientId !== clientId));
    },
    []
  );

  // Settle waiters on terminal transitions (side-effect free: runs in an
  // effect, never inside the state updater). Resolves with both ids so
  // single-file flows don't depend on a stale sessionId closure.
  useEffect(() => {
    for (const f of files) {
      const waiter = waitersRef.current.get(f.clientId);
      if (!waiter) continue;
      if (f.status === FILE_STATES.SUCCESS && f.uploadId) {
        waitersRef.current.delete(f.clientId);
        waiter.resolve({ uploadId: f.uploadId, sessionId });
      } else if (f.status === FILE_STATES.FAILED) {
        waitersRef.current.delete(f.clientId);
        waiter.reject(new Error(f.error || 'Upload failed'));
      } else if (f.status === FILE_STATES.CANCELLED) {
        waitersRef.current.delete(f.clientId);
        waiter.reject(new DOMException('Aborted', 'AbortError'));
      }
    }
  }, [files, sessionId]);

  const overall = useMemo(() => {
    if (files.length === 0) return { ratio: 0, done: true, failed: 0, succeeded: 0 };
    const succeeded = files.filter((f) => f.status === FILE_STATES.SUCCESS).length;
    const failed = files.filter((f) => f.status === FILE_STATES.FAILED).length;
    const ratio = files.reduce((sum, f) => sum + (f.progress || 0), 0) / files.length;
    const done =
      files.every((f) => [FILE_STATES.SUCCESS, FILE_STATES.FAILED, FILE_STATES.CANCELLED].includes(f.status));
    return { ratio, done, failed, succeeded };
  }, [files]);

  const committedUploadIds = useMemo(
    () => files.filter((f) => f.status === FILE_STATES.SUCCESS && f.uploadId).map((f) => f.uploadId),
    [files]
  );

  // Abort in-flight uploads on unmount; backend records expire via TTL and
  // the sweeper destroys the orphaned bytes. Pending waiters reject so
  // single-file flows never hang.
  useEffect(
    () => () => {
      controllersRef.current.forEach((c) => c.abort());
      controllersRef.current.clear();
      waitersRef.current.forEach((w) => w.reject(new DOMException('Aborted', 'AbortError')));
      waitersRef.current.clear();
    },
    []
  );

  return { sessionId, files, addFiles, retry, cancel, waitFor, overall, committedUploadIds, ensureSession };
};
