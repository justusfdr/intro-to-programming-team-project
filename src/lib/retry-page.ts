// Issue #209: what "Try again" does on the error page. A page that failed on the server must be asked
// for again (refresh) before the error is cleared (reset); reset alone shows the same error again
// without any request. Both run inside the transition, so React shows the new page only when it is ready.
export function retryPage(refresh: () => void, reset: () => void, startTransition: (work: () => void) => void): void {
  startTransition(() => {
    refresh();
    reset();
  });
}
