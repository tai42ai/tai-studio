/**
 * States page — the master/detail surface over the subject-keyed state store. The
 * left pane is the states table (`StatesList`); selecting a row sets `?state=`
 * (shell-owned routing via `AppLink`), which drives the right-pane detail
 * (`StateDetail`: the Declaration / Modules / Records / Consumers tabs). Adding
 * `?subject=` + `?target=` opens one subject's record page (`RecordPage`) in place of
 * the tabs. Mirrors the presets page's `?preset=` master/detail shape.
 *
 * The whole surface reads OFF proactively: a deployment with no state store reports
 * the `states` kind `off`, so the page shows the muted `FeatureDisabled` note instead
 * of a list whose every read is empty and every write refuses.
 */
import type { ReactNode } from 'react';
import {
  Card,
  EmptyState,
  FeatureDisabled,
  PageHeader,
  useFeatureOff,
  useFeatureOffMessage,
  type PageProps,
} from '@tai42/studio-sdk';

import { StatesList } from './StatesList';
import { StateDetail } from './StateDetail';
import { RecordPage } from './RecordPage';

export function StatesPage({ search }: PageProps<'states'>): ReactNode {
  const selected = search.state;
  const recordMode = selected !== undefined && search.subject !== undefined;
  const pane = selected !== undefined ? 'detail' : 'list';

  // Proactive OFF read off the kind-status table (no write is attempted here): the
  // server's own `detail` line is the remediation message. OFF is a state, not an error.
  const off = useFeatureOff('states');
  const offMessage = useFeatureOffMessage('states');

  return (
    <div className="tai-stack tai-stack-6" data-testid="states-page">
      <PageHeader
        title="States"
        eyebrow="Capabilities"
        description="Declared JSON documents, one per subject — the record every door reads and writes."
      />

      {off && offMessage !== null ? (
        <Card>
          <FeatureDisabled feature="States" message={offMessage} />
        </Card>
      ) : recordMode ? (
        <RecordPage
          stateName={selected}
          subjectParam={search.subject}
          targetParam={search.target}
        />
      ) : (
        <div className="tai-split" data-pane={pane}>
          <div className="tai-split-list">
            <StatesList selected={selected} />
          </div>

          <div className="tai-split-detail">
            {selected !== undefined ? (
              <StateDetail key={selected} name={selected} tab={search.tab} />
            ) : (
              <Card>
                <EmptyState
                  title="No state selected"
                  description="Choose a state from the list to view its declaration, modules, records and consumers."
                />
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
