import type { CSSProperties } from 'react';
import type { Rect } from './geometry';

export const rectStyle = (r: Rect): CSSProperties => ({ left: r.x, top: r.y, width: r.w, height: r.h });
