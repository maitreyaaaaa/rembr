declare module '*.jsx' {
  import type { ComponentType, ReactElement, ReactNode } from 'react';

  const Component: ComponentType<{
    onBack?: () => void;
    onOpenApp?: () => void;
    onOpenLogin?: () => void;
    onOpenPricing?: () => void;
    onOpenHowTo?: () => void;
    onOpenTerms?: () => void;
    onOpenPrivacy?: () => void;
    onOpenContact?: () => void;
    onOpenHelp?: () => void;
    onOpenSecurity?: () => void;
    onOpenDataDeletion?: () => void;
    onOpenCookies?: () => void;
    onOpenHowTo?: () => void;
    onOpenHelp?: () => void;
    onStartTour?: () => void;
    type?: string;
    kind?: string;
  }>;

  export default Component;
  export function AppShellSkeleton(): ReactElement;
  export function SkeletonCardGrid(props?: { count?: number; layout?: string }): ReactElement;
  export function SkeletonRows(props?: { count?: number; compact?: boolean }): ReactElement;
  export function LoadingSpinner(props?: { className?: string; label?: string }): ReactElement;
  export function ProgressBar(props?: { value?: number | null; label?: string; detail?: string }): ReactElement;
  export function Banner(props: { type?: string; children?: ReactNode }): ReactElement;
}
