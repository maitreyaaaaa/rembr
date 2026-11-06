import { lazy, type ComponentType } from 'react';

export function lazyPage<TModule extends Record<TKey, ComponentType<never>>, TKey extends string>(
  load: () => Promise<TModule>,
  exportName: TKey,
) {
  return lazy(async () => {
    const module = await load();
    return { default: module[exportName] as unknown as ComponentType };
  });
}
