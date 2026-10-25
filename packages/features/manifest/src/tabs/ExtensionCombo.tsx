/**
 * One extension combo as the manifest declares it: each element a neutral `Badge`,
 * the elements joined by a muted "+". A `{ name, config }` element also renders its
 * settings as a collapsed `JsonTree`, so a `!ENV …` marker shows as the marker string
 * the manifest holds.
 */
import type { PresetExtensionElement } from '@tai42/api-client';
import { Badge, JsonTree } from '@tai42/studio-sdk';
import { Fragment, type ReactNode } from 'react';

export function ExtensionCombo({
  combo,
}: {
  readonly combo: readonly PresetExtensionElement[];
}): ReactNode {
  return (
    <div className="tai-row">
      {combo.map((element, index) => (
        // A combo may repeat an element, so the position is part of the key.
        <Fragment key={`${String(index)}:${typeof element === 'string' ? element : element.name}`}>
          {index > 0 ? (
            <span className="tai-muted" aria-hidden="true">
              +
            </span>
          ) : null}
          {typeof element === 'string' ? (
            <Badge>{element}</Badge>
          ) : (
            <span className="tai-stack tai-stack-2">
              <Badge>{element.name}</Badge>
              <JsonTree
                data={element.config}
                defaultExpanded={false}
                label={`${element.name} config`}
              />
            </span>
          )}
        </Fragment>
      ))}
    </div>
  );
}
