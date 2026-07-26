/**
 * The design-system CLASS NAMES the schema-form field tree is built from. One
 * module owns them so the form root, the group wrapper and the union editor
 * cannot drift apart — and so no field component re-derives control geometry or
 * color of its own: every name below is defined in `components.css`, which is
 * the single source of truth for what they look like.
 */

/** The vertical rhythm a sibling set of fields sits in. */
export const stackClass = 'tai-stack';

/** The label + description + error block that introduces a nested group. */
export const groupHeaderClass = 'tai-stack tai-stack-2';

/**
 * The surface a nested object / array / union renders its children on. A card
 * makes every level of nesting a visible container on its own ground, so depth
 * reads without any hand-drawn indent rail.
 */
export const groupClass = 'tai-card tai-stack tai-stack-3';
