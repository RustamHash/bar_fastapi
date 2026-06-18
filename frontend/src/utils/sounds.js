const sounds = {
  success: '/sounds/success.wav',
  error: '/sounds/error.wav',
  warning: '/sounds/warning.wav',
};

export function playSound(type) {
  const src = sounds[type];
  if (!src) return;
  const audio = new Audio(src);
  audio.volume = 0.7;
  audio.play().catch(() => {});
}

export function getScanSoundType(status) {
  if (status === 'unknown') return 'error';
  if (status === 'over') return 'warning';
  return 'success';
}
