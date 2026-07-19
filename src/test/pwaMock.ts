export function useRegisterSW() {
  return {
    needRefresh: [false, () => undefined] as const,
    updateServiceWorker: () => Promise.resolve(),
  }
}
