// Remembers which forum channel to open next (from Home or a notification)
let pending: string | null = null;

export function requestOpenChannel(id: string | number) {
  pending = String(id);
}

export function takePendingChannel(): string | null {
  const p = pending;
  pending = null;
  return p;
}