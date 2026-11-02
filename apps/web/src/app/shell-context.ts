import { useOutletContext } from 'react-router-dom';
import type { Session } from './contracts.js';

export interface ShellContext { session: Session; setSession: (session: Session | null) => void }
export function useShell() { return useOutletContext<ShellContext>(); }
