import { useEffect } from 'react';
import { Check } from 'lucide-react';
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import styles from './progress.module.css';

export interface ProgressProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
  value?: number;
  max?: number;
  label?: string;
  showValue?: boolean;
}

export function Progress({ value = 0, max = 100, label, showValue = false, className, ...props }: ProgressProps) {
  const reduceMotion = useReducedMotion();
  const safeMax = Number.isFinite(max) && max > 0 ? max : 100;
  const safeValue = Number.isFinite(value) ? Math.min(Math.max(value, 0), safeMax) : 0;
  const percentage = Math.round((safeValue / safeMax) * 100);
  const complete = percentage >= 100;
  const progress = useMotionValue(percentage);
  const x = useTransform(progress, (current) => `${Math.min(Math.max(current, 0), 100) - 100}%`);
  const counted = useTransform(progress, (current) => `${Math.round(Math.min(Math.max(current, 0), 100))}%`);

  useEffect(() => {
    if (reduceMotion) {
      progress.jump(percentage);
      return;
    }
    const controls = animate(progress, percentage, { type: 'spring', stiffness: 170, damping: 28, mass: 0.5 });
    return () => controls.stop();
  }, [percentage, progress, reduceMotion]);

  return <div
    {...props}
    className={[styles.progress, className].filter(Boolean).join(' ')}
    data-complete={complete ? '' : undefined}
    role="progressbar"
    aria-label={label ?? 'Progress'}
    aria-valuemin={0}
    aria-valuemax={safeMax}
    aria-valuenow={safeValue}
    aria-valuetext={`${percentage}% complete`}
  >
    {(label || showValue) && <div className={styles.meta}>
      {label ? <span className={styles.label}>{label}</span> : <span />}
      {showValue && <span className={styles.value}>
        {complete && <motion.span
          className={styles.done}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.65 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 300, damping: 22 }}
        ><Check size={14} strokeWidth={1.75} aria-hidden="true" /></motion.span>}
        <motion.span className={styles.count}>{counted}</motion.span>
      </span>}
    </div>}
    <div className={styles.track}><motion.span className={styles.fill} style={{ x }} /></div>
  </div>;
}
