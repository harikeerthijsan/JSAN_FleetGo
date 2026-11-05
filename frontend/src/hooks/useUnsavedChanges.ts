import { useEffect, useRef } from 'react';
import { useBlocker } from 'react-router-dom';

/** Protect edits for links, back/forward navigation, reload and closing the tab. */
export function useUnsavedChanges(dirty: boolean) {
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    dirtyRef.current && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    const onUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault(); event.returnValue = '';
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, []);
  return { blocker, allowNavigation: () => { dirtyRef.current = false; } };
}
