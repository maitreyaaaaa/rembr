import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { CheckCircle2, FileArchive, FileImage, FileText, FileUp, Upload, X } from 'lucide-react';
import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring } from 'motion/react';
import styles from './MagneticDropZone.module.css';

const magnetSpring = { damping: 24, mass: 0.65, stiffness: 280 };

type Props = {
  accept: string;
  maxSize: number;
  multiple?: boolean;
  maxFiles?: number;
  maxTotalSize?: number;
  selectedFiles?: File[];
  disabled?: boolean;
  compact?: boolean;
  label?: string;
  hint?: string;
  onFilesChange: (files: File[]) => void;
};

function isFileDrag(dataTransfer: DataTransfer | null) {
  return Boolean(dataTransfer && Array.from(dataTransfer.types).includes('Files'));
}

function acceptsFile(file: File, accept: string) {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return accept.split(',').some((rawRule) => {
    const rule = rawRule.trim().toLowerCase();
    if (rule.startsWith('.')) return name.endsWith(rule);
    if (rule.endsWith('/*')) return type.startsWith(rule.slice(0, -1));
    return type === rule;
  });
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MiB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KiB`;
}

function fileIcon(file: File) {
  if (file.type.startsWith('image/')) return FileImage;
  if (/\.zip$/i.test(file.name) || file.type.includes('zip')) return FileArchive;
  if (/\.(html?|js|json|csv|txt)$/i.test(file.name)) return FileText;
  return FileUp;
}

export function MagneticDropZone({
  accept,
  maxSize,
  multiple = false,
  maxFiles = multiple ? 20 : 1,
  maxTotalSize,
  selectedFiles = [],
  disabled = false,
  compact = false,
  label = multiple ? 'Drop export files here' : 'Drop an image here',
  hint,
  onFilesChange,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const zoneRef = useRef<HTMLDivElement>(null);
  const [localFile, setLocalFile] = useState<File | null>(null);
  const [near, setNear] = useState(false);
  const [over, setOver] = useState(false);
  const [error, setError] = useState('');
  const reduceMotion = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const scale = useMotionValue(1);
  const glowX = useMotionValue(0);
  const glowY = useMotionValue(0);
  const springX = useSpring(x, magnetSpring);
  const springY = useSpring(y, magnetSpring);
  const springScale = useSpring(scale, magnetSpring);
  const springGlowX = useSpring(glowX, magnetSpring);
  const springGlowY = useSpring(glowY, magnetSpring);
  const transform = useMotionTemplate`translate3d(${springX}px, ${springY}px, 0) scale(${springScale})`;
  const glowTransform = useMotionTemplate`translate3d(${springGlowX}px, ${springGlowY}px, 0)`;
  const selectedCount = selectedFiles.length;
  const selectedSize = selectedFiles.reduce((total, file) => total + file.size, 0);
  const preview = selectedFiles[0] ?? localFile;
  const PreviewIcon = preview ? fileIcon(preview) : FileUp;

  const resetMagnet = useCallback(() => {
    x.set(0); y.set(0); scale.set(1); glowX.set(0); glowY.set(0);
    setNear(false); setOver(false);
  }, [glowX, glowY, scale, x, y]);

  useEffect(() => {
    function handleWindowDragOver(event: globalThis.DragEvent) {
      if (disabled || !isFileDrag(event.dataTransfer)) return;
      const zone = zoneRef.current;
      if (!zone) return;
      const rect = zone.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const distanceX = Math.max(Math.abs(event.clientX - centerX) - rect.width / 2, 0);
      const distanceY = Math.max(Math.abs(event.clientY - centerY) - rect.height / 2, 0);
      const distance = Math.hypot(distanceX, distanceY);
      const pointerIsOver = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
      const proximity = Math.max(0, 1 - distance / 180);
      if (!proximity) { resetMagnet(); return; }
      const deltaX = event.clientX - centerX;
      const deltaY = event.clientY - centerY;
      const pointerDistance = Math.max(Math.hypot(deltaX, deltaY), 1);
      const offset = pointerIsOver ? 0 : proximity * 10;
      x.set(reduceMotion ? 0 : (deltaX / pointerDistance) * offset);
      y.set(reduceMotion ? 0 : (deltaY / pointerDistance) * offset);
      scale.set(reduceMotion ? 1 : pointerIsOver ? 1.025 : 1.01);
      glowX.set(reduceMotion ? 0 : deltaX);
      glowY.set(reduceMotion ? 0 : deltaY);
      setNear(true); setOver(pointerIsOver);
    }
    window.addEventListener('dragover', handleWindowDragOver);
    window.addEventListener('dragend', resetMagnet);
    window.addEventListener('drop', resetMagnet);
    return () => {
      window.removeEventListener('dragover', handleWindowDragOver);
      window.removeEventListener('dragend', resetMagnet);
      window.removeEventListener('drop', resetMagnet);
    };
  }, [disabled, glowX, glowY, reduceMotion, resetMagnet, scale, x, y]);

  function acceptFiles(incoming: File[]) {
    const next = multiple ? [...selectedFiles, ...incoming] : incoming.slice(0, 1);
    const unsupported = next.find((file) => !acceptsFile(file, accept));
    const oversized = next.find((file) => file.size < 1 || file.size > maxSize);
    const nextTotal = next.reduce((total, file) => total + file.size, 0);
    if (unsupported) { setError(`${unsupported.name} is not a supported file type.`); return; }
    if (oversized) { setError(`${oversized.name} must be no larger than ${formatBytes(maxSize)}.`); return; }
    if (next.length > maxFiles) { setError(`Choose no more than ${maxFiles} files.`); return; }
    if (maxTotalSize !== undefined && nextTotal > maxTotalSize) { setError(`Selected files must total no more than ${formatBytes(maxTotalSize)}.`); return; }
    if (!incoming.length) return;
    setError('');
    if (!selectedFiles.length) setLocalFile(next[0] ?? null);
    onFilesChange(next);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault(); event.stopPropagation();
    if (!disabled) acceptFiles(Array.from(event.dataTransfer.files));
    resetMagnet();
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (!disabled && isFileDrag(event.dataTransfer)) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; }
  }

  function handleInput(event: ChangeEvent<HTMLInputElement>) {
    acceptFiles(Array.from(event.currentTarget.files ?? []));
    event.currentTarget.value = '';
  }

  return <motion.div
    ref={zoneRef}
    className={`${styles.zone}${compact ? ` ${styles.compact}` : ''}${near ? ` ${styles.near}` : ''}${over ? ` ${styles.over}` : ''}${disabled ? ` ${styles.disabled}` : ''}`}
    onDragOver={handleDragOver}
    onDrop={handleDrop}
    style={{ transform: reduceMotion ? undefined : transform }}
    aria-disabled={disabled}
  >
    <input ref={inputRef} className={styles.input} type="file" accept={accept} multiple={multiple} disabled={disabled} onChange={handleInput} aria-label={multiple ? 'Choose export files' : 'Choose an image'} />
    <motion.span aria-hidden="true" className={styles.glow} style={{ transform: glowTransform }} />
    <div className={styles.content}>
      {preview ? <span className={styles.fileIcon}><PreviewIcon size={22} aria-hidden="true" /></span> : <span className={styles.fileIcon}><FileUp size={22} aria-hidden="true" /></span>}
      <strong>{over ? 'Release to add' : preview ? (multiple ? `${selectedCount} file${selectedCount === 1 ? '' : 's'} selected` : 'Image ready to crop') : label}</strong>
      <span className={styles.hint}>{hint ?? (multiple ? 'Drop here or browse · 25 MiB per file' : 'Drop here or browse · up to 250 KiB')}</span>
      {multiple && selectedCount > 0 && <span className={styles.fileSummary}>{selectedCount} selected · {formatBytes(selectedSize)} total</span>}
      <button type="button" className={styles.browse} disabled={disabled} onClick={() => inputRef.current?.click()}>
        <Upload size={14} aria-hidden="true" /> {multiple ? 'Choose files' : preview ? 'Choose another photo' : 'Choose a photo'}
      </button>
    </div>
    {error && <p className={styles.error} role="alert">{error}<button type="button" aria-label="Dismiss upload error" onClick={() => setError('')}><X size={13} /></button></p>}
    <span className={styles.live} role="status" aria-live="polite">{over ? 'Release files to add them' : ''}</span>
    {preview && !multiple && <span className={styles.ready}><CheckCircle2 size={14} aria-hidden="true" /> Ready</span>}
  </motion.div>;
}
