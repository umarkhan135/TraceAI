export function sqrt(n: number): number {
  if (n < 0) {
    throw new Error('Cannot compute square root of negative number');
  }
  return Math.sqrt(n);
}
