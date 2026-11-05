import { useEffect } from 'react';

/** Keeps the browser tab title in sync with the current page. */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} · FleetGo`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
