import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';

const stageSize = 248;
const cropSize = 184;
const outputSize = 256;
const maxFileSize = 250 * 1024;
const acceptedTypes = ['image/png', 'image/jpeg', 'image/webp'];

type Point = { x: number; y: number };
type CropGesture = { point: Point; centroid: Point; distance: number; offset: Point; zoom: number };

export function AvatarUpload({
  name,
  src,
  file,
  busy = false,
  progress = null,
  uploadError = '',
  onCancelUpload,
  onRetryUpload,
  onDiscardUpload,
  onChange,
}: {
  name: string;
  src?: string | null;
  file: File | null;
  busy?: boolean;
  progress?: number | null;
  uploadError?: string;
  onCancelUpload?: () => void;
  onRetryUpload?: () => void;
  onDiscardUpload?: () => void;
  onChange: (file: File | null, removed?: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const cropStageRef = useRef<HTMLDivElement>(null);
  const cropImageRef = useRef<HTMLImageElement>(null);
  const pointersRef = useRef(new Map<number, Point>());
  const gestureRef = useRef<CropGesture | null>(null);
  const fileUrl = useMemo(() => file ? URL.createObjectURL(file) : null, [file]);
  const [cropUrl, setCropUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [error, setError] = useState('');
  const [cropping, setCropping] = useState(false);
  const [savingCrop, setSavingCrop] = useState(false);
  const [removed, setRemoved] = useState(false);

  function setCroppingWithMotion(next: boolean) {
    const content = contentRef.current;
    if (!content) { setCropping(next); return; }
    content.style.height = `${content.getBoundingClientRect().height}px`;
    content.style.overflow = 'hidden';
    setCropping(next);
    window.requestAnimationFrame(() => {
      const targetHeight = content.scrollHeight;
      content.style.height = `${targetHeight}px`;
      if (Math.abs(targetHeight - content.getBoundingClientRect().height) < 1) {
        content.style.height = 'auto';
        content.style.overflow = 'visible';
      }
    });
  }

  useEffect(() => () => { if (fileUrl) URL.revokeObjectURL(fileUrl); }, [fileUrl]);
  useEffect(() => () => { if (cropUrl) URL.revokeObjectURL(cropUrl); }, [cropUrl]);
  useEffect(() => {
    if (!cropping) return undefined;
    const frame = window.requestAnimationFrame(() => cropStageRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [cropping]);

  function setCropSource(next: string | null) {
    setCropUrl(next);
  }

  function beginCrop(candidate: File) {
    if (!acceptedTypes.includes(candidate.type)) {
      const isPdf = candidate.type === 'application/pdf' || /\.pdf$/i.test(candidate.name);
      setError(isPdf ? 'PDF files aren’t supported. Choose a PNG, JPG, or WebP.' : 'That file type isn’t supported. Choose a PNG, JPG, or WebP.');
      return;
    }
    if (candidate.size > maxFileSize) {
      setError(`That photo is ${formatFileSize(candidate.size)}. Choose one up to 250 KB.`);
      return;
    }
    setError('');
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setRemoved(false);
    setCropSource(URL.createObjectURL(candidate));
    setCroppingWithMotion(true);
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const candidate = event.target.files?.[0];
    if (candidate) beginCrop(candidate);
    event.target.value = '';
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!busy && !cropping) {
      const candidate = event.dataTransfer.files[0];
      if (candidate) beginCrop(candidate);
    }
  }

  function clampOffset(next: Point, nextZoom = zoom): Point {
    const image = cropImageRef.current;
    if (!image?.naturalWidth || !image.naturalHeight) return next;
    const baseScale = stageSize / Math.min(image.naturalWidth, image.naturalHeight);
    const maxX = Math.max(0, (image.naturalWidth * baseScale * nextZoom - cropSize) / 2);
    const maxY = Math.max(0, (image.naturalHeight * baseScale * nextZoom - cropSize) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, next.x)), y: Math.min(maxY, Math.max(-maxY, next.y)) };
  }

  function zoomTo(value: number) {
    const nextZoom = Math.min(3, Math.max(1, value));
    setZoom(nextZoom);
    setOffset((current) => clampOffset(current, nextZoom));
  }

  function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointersRef.current.values()];
    const first = points[0] ?? { x: event.clientX, y: event.clientY };
    const second = points[1] ?? first;
    const centroid = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
    gestureRef.current = {
      point: first,
      centroid,
      distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
      offset,
      zoom,
    };
  }

  function pointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointersRef.current.has(event.pointerId)) return;
    const current = { x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, current);
    const gesture = gestureRef.current;
    if (!gesture) return;
    const points = [...pointersRef.current.values()];
    if (points.length > 1) {
      const first = points[0];
      const second = points[1];
      if (!first || !second) return;
      const centroid = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
      const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
      zoomTo(gesture.zoom * distance / gesture.distance);
      setOffset(clampOffset({ x: gesture.offset.x + centroid.x - gesture.centroid.x, y: gesture.offset.y + centroid.y - gesture.centroid.y }));
    } else {
      setOffset(clampOffset({ x: gesture.offset.x + current.x - gesture.point.x, y: gesture.offset.y + current.y - gesture.point.y }));
    }
  }

  function pointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    pointersRef.current.delete(event.pointerId);
    const remaining = [...pointersRef.current.values()][0];
    gestureRef.current = remaining ? { point: remaining, centroid: remaining, distance: 1, offset, zoom } : null;
  }

  function handleCropKeys(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 20 : 6;
    if (event.key === 'Escape') { event.preventDefault(); cancelCrop(); }
    else if (event.key === 'Enter') { event.preventDefault(); void saveCrop(); }
    else if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomTo(zoom + 0.1); }
    else if (event.key === '-') { event.preventDefault(); zoomTo(zoom - 0.1); }
    else if (event.key === '0') { event.preventDefault(); setZoom(1); setOffset({ x: 0, y: 0 }); }
    else if (event.key.startsWith('Arrow')) {
      event.preventDefault();
      setOffset((current) => clampOffset({
        x: current.x + (event.key === 'ArrowLeft' ? step : event.key === 'ArrowRight' ? -step : 0),
        y: current.y + (event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0),
      }));
    }
  }

  function cancelCrop() {
    pointersRef.current.clear();
    gestureRef.current = null;
    setCroppingWithMotion(false);
    setCropSource(null);
    window.requestAnimationFrame(() => previewRef.current?.focus());
  }

  async function saveCrop() {
    const image = cropImageRef.current;
    if (!image || !image.naturalWidth || !cropUrl) { setError('This photo could not be opened. Choose another image.'); return; }
    setSavingCrop(true);
    setError('');
    try {
      const baseScale = Math.max(stageSize / image.naturalWidth, stageSize / image.naturalHeight);
      const sourceSize = Math.min(image.naturalWidth, image.naturalHeight) * cropSize / (stageSize * zoom);
      const centerX = image.naturalWidth / 2 - offset.x / (baseScale * zoom);
      const centerY = image.naturalHeight / 2 - offset.y / (baseScale * zoom);
      const sourceX = Math.min(image.naturalWidth - sourceSize, Math.max(0, centerX - sourceSize / 2));
      const sourceY = Math.min(image.naturalHeight - sourceSize, Math.max(0, centerY - sourceSize / 2));
      const canvas = document.createElement('canvas');
      canvas.width = outputSize;
      canvas.height = outputSize;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Image editing is not available in this browser.');
      context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, outputSize, outputSize);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Could not crop this photo.')), 'image/jpeg', 0.82));
      if (blob.size > maxFileSize) throw new Error('The cropped photo is too large. Choose a smaller image and try again.');
      onChange(new File([blob], 'avatar.jpg', { type: 'image/jpeg', lastModified: Date.now() }), false);
      cancelCrop();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not crop this photo. Choose another image and try again.');
    } finally { setSavingCrop(false); }
  }

  const displaySource = fileUrl ?? (removed ? null : src) ?? null;
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || 'R';
  const uploadPercent = Math.min(100, Math.max(busy ? 1 : 0, progress ?? 0));
  const circumference = 2 * Math.PI * 43;
  const shownError = error || uploadError;

  return <div className="avatar-upload" aria-busy={busy || savingCrop} onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
    <input ref={inputRef} className="visually-hidden" type="file" accept={acceptedTypes.join(',')} onChange={handleFile} disabled={busy || cropping} tabIndex={-1} aria-hidden="true" />
    <div className="avatar-upload-heading"><h2>Profile</h2><p>Click or drop a photo on the avatar.</p></div>
    <div ref={contentRef} className="avatar-upload-content" onTransitionEnd={(event) => {
      if (event.target === event.currentTarget && event.propertyName === 'height') {
        event.currentTarget.style.height = 'auto';
        event.currentTarget.style.overflow = 'visible';
      }
    }}>
    {cropping && cropUrl ? <div className="avatar-crop-body">
      <div
        ref={cropStageRef}
        className="avatar-crop-stage"
        role="group"
        tabIndex={0}
        aria-label="Adjust photo crop. Use arrow keys to move, plus and minus to zoom, zero to reset, Escape to cancel, and Enter to save."
        onKeyDown={handleCropKeys}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
        onWheel={(event) => { event.preventDefault(); zoomTo(zoom + (event.deltaY < 0 ? 0.1 : -0.1)); }}
      >
        <img ref={cropImageRef} className="avatar-crop-photo" src={cropUrl} alt="" draggable={false} style={{ transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${zoom})` }} />
        <span className="avatar-crop-mask" aria-hidden="true" />
      </div>
      <div className="avatar-crop-controls">
        <div><strong>Adjust photo</strong><p className="avatar-crop-hint">Drag to reposition. Scroll or pinch to zoom.</p></div>
        <div className="avatar-zoom-row">
          <button type="button" className="avatar-icon-button" aria-label="Zoom out" disabled={zoom <= 1} onClick={() => zoomTo(zoom - 0.1)}>−</button>
          <input type="range" min="1" max="3" step="0.01" aria-label="Photo zoom" aria-valuetext={`${Math.round(zoom * 100)} percent`} value={zoom} onChange={(event) => zoomTo(Number(event.target.value))} />
          <button type="button" className="avatar-icon-button" aria-label="Zoom in" disabled={zoom >= 3} onClick={() => zoomTo(zoom + 0.1)}>+</button>
        </div>
        <div className="avatar-crop-actions">
          <button type="button" className="avatar-light-button" disabled={savingCrop} onClick={() => void saveCrop()}>{savingCrop ? 'Preparing…' : 'Save photo'}</button>
          <button type="button" className="avatar-text-button" disabled={savingCrop} onClick={cancelCrop}>Cancel</button>
        </div>
      </div>
    </div> : <div className="avatar-upload-main">
      <div className={`avatar-photo-shell${uploadError ? ' has-error' : ''}${busy ? ' is-uploading' : ''}`}>
        <button ref={previewRef} className="avatar-preview" type="button" disabled={busy} aria-label={displaySource ? 'Change profile photo' : 'Upload profile photo'} onClick={() => inputRef.current?.click()}>
          {displaySource ? <img src={displaySource} alt="" /> : <span>{initials}</span>}
        </button>
        {(busy || uploadError) && <svg className="avatar-progress-ring" viewBox="0 0 92 92" aria-hidden="true">
          <circle className="avatar-progress-track" cx="46" cy="46" r="43" />
          <circle className="avatar-progress-value" cx="46" cy="46" r="43" style={{ strokeDasharray: circumference, strokeDashoffset: uploadError ? 0 : circumference * (1 - uploadPercent / 100) }} />
        </svg>}
      </div>
      <div className="avatar-upload-copy">
        <strong>Profile photo</strong>
        {busy ? <p className="avatar-upload-status" role="status" aria-live="polite">Uploading {uploadPercent}%</p> : shownError ? <p className="avatar-upload-error" role="alert"><span aria-hidden="true">ⓘ</span>{shownError}</p> : <p>PNG, JPG, or WebP, up to 250 KB.</p>}
        <div className="avatar-upload-actions">
          {busy ? <>
            {uploadPercent < 100 && <button type="button" className="avatar-outline-button" onClick={onCancelUpload}>Cancel upload</button>}
          </> : uploadError ? <>
            <button type="button" className="avatar-light-button" onClick={onRetryUpload}>Try again</button>
            <button type="button" className="avatar-text-button" onClick={onDiscardUpload}>Discard</button>
          </> : <>
            <button type="button" className="avatar-outline-button" disabled={cropping} onClick={() => inputRef.current?.click()}>{displaySource ? 'Replace photo' : 'Upload photo'}</button>
            {displaySource && <button type="button" className="avatar-text-button" disabled={cropping} onClick={() => { setRemoved(true); onChange(null, true); setError(''); }}>Remove</button>}
          </>}
        </div>
      </div>
    </div>}
    </div>
    <div className="visually-hidden" role="status" aria-live="polite">{busy ? `Photo upload ${uploadPercent}% complete` : ''}</div>
  </div>;
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
