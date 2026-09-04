import type { ComponentProps } from 'react';

/**
 * Uses a full-document navigation because vinext's production `next/link`
 * client handler currently throws before internal routes can open.
 */
export function NativeNavigationLink({
  children,
  ...props
}: ComponentProps<'a'>) {
  return <a {...props}>{children}</a>;
}
