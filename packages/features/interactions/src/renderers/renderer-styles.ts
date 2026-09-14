/** Shared inline styles for the per-format answer renderers and the inbox card. */
import type { CSSProperties } from 'react';

export const cardBodyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-4)',
};

export const promptStyle: CSSProperties = {
  margin: 0,
  fontSize: 'var(--tai-text-md)',
  fontFamily: 'var(--tai-font-sans)',
  color: 'var(--tai-color-text)',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

export const answerStackStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-3)',
};

export const buttonRowStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--tai-space-2)',
};

// The withdraw action is a QUIET, secondary affordance: right-aligned and ghost, so
// it sits apart from the format's primary Submit and never competes with answering.
export const cancelRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
};

export const answeredStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--tai-space-2)',
};

export const attributionStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--tai-space-2)',
};

export const malformedStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--tai-space-2)',
};

// A read-only context block beside the form (the per-send options and the pages
// outline): a small heading over a muted list, distinct from the answer controls.
export const formContextStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-1)',
};

export const contextHeadingStyle: CSSProperties = {
  margin: 0,
  fontSize: 'var(--tai-text-sm)',
  fontWeight: 600,
  color: 'var(--tai-color-text)',
};

export const contextListStyle: CSSProperties = {
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-1)',
  fontSize: 'var(--tai-text-sm)',
  color: 'var(--tai-color-text-muted)',
};

export const pagesListStyle: CSSProperties = {
  ...contextListStyle,
  paddingLeft: 'var(--tai-space-5)',
};

export const optionRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--tai-space-2)',
};

export const optionFieldStyle: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--tai-font-mono)',
  color: 'var(--tai-color-text)',
};

export const optionValuesStyle: CSSProperties = {
  margin: 0,
};
