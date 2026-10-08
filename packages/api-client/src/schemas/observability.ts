/** Run metrics, listing, span and trace response schemas. */
import { z } from 'zod';

import { jsonValue } from './shared';

export const dashboardMetrics = z.object({
  summary: z.object({
    totalRuns: z.number(),
    totalCost: z.number(),
    totalTokens: z.number(),
    averageLatencyMs: z.number(),
    avgCostPerRun: z.number(),
    avgTokensPerRun: z.number(),
    timeToFirstTokenMs: z.number().nullable(),
  }),
  timeSeries: z.array(
    z.object({
      bucket: z.string().nullable(),
      runs: z.number(),
      cost: z.number(),
      avgLatencyMs: z.number(),
      totalTokens: z.number(),
    }),
  ),
  byModel: z.array(
    z.object({
      model: z.string(),
      calls: z.number(),
      cost: z.number(),
      totalTokens: z.number(),
      avgLatencyMs: z.number(),
    }),
  ),
  // `false` when the by-model sub-query faulted, so an empty breakdown is
  // distinguishable from an unavailable one.
  byModelAvailable: z.boolean(),
  granularity: z.enum(['hour', 'day', 'week']),
});
export type DashboardMetrics = z.infer<typeof dashboardMetrics>;

export const run = z.object({
  id: z.string(),
  traceId: z.string(),
  createdAt: z.string().nullable(),
  tags: z.array(z.string()),
  status: z.enum(['error', 'success']),
  cost: z.number().nullable(),
  latencyMs: z.number().nullable(),
  totalTokens: z.number().nullable(),
  inputPreview: jsonValue,
  outputPreview: jsonValue,
});
export type Run = z.infer<typeof run>;

export const runsPage = z.object({
  items: z.array(run),
  page: z.number(),
  nextPage: z.number().nullable(),
});

/** The neutral span kinds the monitoring backend maps its own observation types onto. */
export const spanKind = z.enum(['LLM', 'TOOL', 'CHAIN', 'EVENT']);
export type SpanKind = z.infer<typeof spanKind>;

/** One span of a run without its input and output: the light span-tree row. */
export const runSpanOutline = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  traceId: z.string().nullable(),
  name: z.string().nullable(),
  kind: spanKind.nullable(),
  level: z.string().nullable(),
  statusMessage: z.string().nullable(),
  start: z.string().nullable(),
  end: z.string().nullable(),
  model: z.string().nullable(),
  inputTokens: z.number().int().nullable(),
  outputTokens: z.number().int().nullable(),
  totalTokens: z.number().int().nullable(),
  metadata: jsonValue.nullable(),
});
export type RunSpanOutline = z.infer<typeof runSpanOutline>;

export const runSpan = runSpanOutline.extend({
  input: jsonValue,
  output: jsonValue,
});
export type RunSpan = z.infer<typeof runSpan>;

/** A run's span tree (`GET /api/observability/runs/{trace}/trace/outline`). */
export const runTraceOutline = z.object({
  traceId: z.string(),
  spans: z.array(runSpanOutline),
});
export type RunTraceOutline = z.infer<typeof runTraceOutline>;

export const runTrace = z.object({
  traceId: z.string(),
  timestamp: z.string().nullable(),
  tags: z.array(z.string()),
  totalCost: z.number().nullable(),
  input: jsonValue,
  output: jsonValue,
  metadata: jsonValue.nullable(),
  spans: z.array(runSpan),
});
export type RunTrace = z.infer<typeof runTrace>;

/**
 * What the monitoring backend serves, in the run list's wire names
 * (`GET /api/observability/capabilities`): the largest run-list page, the sort keys
 * it serves, the filter params each sort cannot be combined with, and the metrics
 * measures and dimensions.
 */
export const observabilityCapabilities = z.object({
  pageSizeMax: z.number().int(),
  sortKeys: z.array(z.string()),
  incompatibleFilters: z.record(z.string(), z.array(z.string())),
  metrics: z.object({
    measures: z.array(z.string()),
    dimensions: z.array(z.string()),
  }),
});
export type ObservabilityCapabilities = z.infer<typeof observabilityCapabilities>;

/** One span field's value with every record reference resolved. */
export const resolvedSpanValue = z.object({
  traceId: z.string(),
  spanId: z.string(),
  field: z.enum(['input', 'output']),
  pointer: z.string(),
  value: jsonValue,
});
export type ResolvedSpanValue = z.infer<typeof resolvedSpanValue>;
