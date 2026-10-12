/** Run metrics, listing, span and trace response schemas. */
import type { z } from 'zod';

import * as openapi from '../generated/openapi-schemas';

// `byModelAvailable` is `false` when the by-model sub-query faulted, so an empty breakdown is
// distinguishable from an unavailable one.
export const dashboardMetrics = openapi.metricsResult;
export type DashboardMetrics = z.infer<typeof dashboardMetrics>;

export const run = openapi.observabilityRunView;
export type Run = z.infer<typeof run>;

export const runsPage = openapi.observabilityRunsPage;

/** The neutral span kinds the monitoring backend maps its own observation types onto. */
export const spanKind = openapi.spanOutlineView.shape.kind.unwrap().unwrap();
export type SpanKind = z.infer<typeof spanKind>;

/** One span of a run without its input and output: the light span-tree row. */
export const runSpanOutline = openapi.spanOutlineView;
export type RunSpanOutline = z.infer<typeof runSpanOutline>;

export const runSpan = openapi.spanView;
export type RunSpan = z.infer<typeof runSpan>;

/** A run's span tree (`GET /api/observability/runs/{trace}/trace/outline`). */
export const runTraceOutline = openapi.runTraceOutlineView;
export type RunTraceOutline = z.infer<typeof runTraceOutline>;

export const runTrace = openapi.runTraceView;
export type RunTrace = z.infer<typeof runTrace>;

/**
 * What the monitoring backend serves, in the run list's wire names
 * (`GET /api/observability/capabilities`): the largest run-list page, the sort keys
 * it serves, the filter params each sort cannot be combined with, and the metrics
 * measures and dimensions.
 */
export const observabilityCapabilities = openapi.observabilityCapabilities;
export type ObservabilityCapabilities = z.infer<typeof observabilityCapabilities>;

/** One span field's value with every record reference resolved. */
export const resolvedSpanValue = openapi.resolvedSpanValue;
export type ResolvedSpanValue = z.infer<typeof resolvedSpanValue>;
