import React, { useEffect, useRef, useState } from 'react';

// Captures a live photo from the device camera (getUserMedia) - used for
// identity verification selfies. Deliberately does not accept file uploads
// as a fallback, since the point is to confirm the photo was taken live.
//
// The camera stream is only ever opened in response to an explicit user
// click ("Open Camera") - it never starts automatically on mount - and the
// stream is stopped again the moment a photo is captured (or the user
// navigates away), so the webcam light isn't left on any longer than
// necessary.
const CameraCapture = ({ onCapture, capturedImage, onRetake }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [ready, setReady] = useState(false);

  const startCamera = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      setCameraOpen(true);
      // videoRef isn't attached to the DOM until after this render, since the
      // <video> element only mounts once cameraOpen is true.
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setReady(true);
        }
      });
    } catch (err) {
      setError('Camera access was denied or is unavailable. Please allow camera access to continue.');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraOpen(false);
    setReady(false);
  };

  // Only ever clean up an active stream on unmount - never auto-start one.
  useEffect(() => {
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCapture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      const file = new File([blob], `selfie-${Date.now()}.jpg`, { type: 'image/jpeg' });
      const previewUrl = URL.createObjectURL(blob);
      onCapture(file, previewUrl);
      stopCamera();
    }, 'image/jpeg', 0.9);
  };

  const handleRetake = () => {
    stopCamera();
    onRetake();
  };

  if (capturedImage) {
    return (
      <div>
        <img src={capturedImage} alt="Captured selfie" className="w-full max-w-xs rounded-sm border border-navy/15" />
        <button type="button" onClick={handleRetake} className="btn-secondary text-sm mt-3 py-2 px-4">
          Retake photo
        </button>
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="bg-brick-light text-brick text-sm px-4 py-3 rounded-sm mb-3">
          {error}
        </div>
      )}

      {cameraOpen ? (
        <>
          <div className="w-full max-w-xs bg-navy rounded-sm overflow-hidden aspect-[4/3] flex items-center justify-center">
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          </div>
          <button
            type="button"
            onClick={handleCapture}
            disabled={!ready}
            className="btn-gold text-sm mt-3 py-2 px-4 disabled:opacity-50"
          >
            Capture photo
          </button>
        </>
      ) : (
        <div className="w-full max-w-xs bg-parchment border border-dashed border-navy/20 rounded-sm aspect-[4/3] flex flex-col items-center justify-center gap-3 text-center px-4">
          <p className="text-sm text-slate-muted">Your camera is off. Click below when you're ready to take your photo.</p>
          <button type="button" onClick={startCamera} className="btn-gold text-sm py-2 px-4">
            Open Camera
          </button>
        </div>
      )}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default CameraCapture;
