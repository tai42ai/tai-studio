/**
 * The `/system` feature page: operational health, the execution backend identity and
 * worker fleet, and the pluggable-kind status table. Each surface renders its own
 * state machine (loading → Skeleton, error → loud ErrorState, empty → EmptyState), so
 * a failed request is never a silent empty render.
 */
import type { ReactNode } from 'react';
import { PageHeader, Stack, type PageProps } from '@tai42/studio-sdk';

import { HealthCard } from './HealthCard';
import { BackendFleet } from './BackendFleet';
import { KindsCard } from './KindsCard';

/**
 * The `system` route carries no search parameters, so the component declares the
 * shell's `PageProps<'system'>` contract for its call site but reads nothing from it.
 */
export const SystemPage: (props: PageProps<'system'>) => ReactNode = () => (
  <Stack gap={6}>
    <PageHeader eyebrow="Administration" title="System" />
    <HealthCard />
    <BackendFleet />
    <KindsCard />
  </Stack>
);
