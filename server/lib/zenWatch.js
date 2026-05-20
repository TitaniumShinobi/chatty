let started = false;

export function startZenWatch() {
  if (started) return;
  started = true;
  console.log('[ZenWatch] disabled (no local implementation configured)');
}

export function stopZenWatch() {
  started = false;
}

export default {
  startZenWatch,
  stopZenWatch,
};
