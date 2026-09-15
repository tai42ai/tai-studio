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

export const runSpan = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  traceId: z.string().nullable(),
  name: z.string().nullable(),
  type: z.string().nullable(),
  level: z.string().nullable(),
  statusMessage: z.string().nullable(),
  start: z.string().nullable(),
  end: z.string().nullable(),
  model: z.string().nullable(),
  usage: jsonValue.nullable(),
  metadata: jsonValue.nullable(),
  input: jsonValue,
  output: jsonValue,
  nodeId: z.string().nullable(),
});
export type RunSpan = z.infer<typeof runSpan>;

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
