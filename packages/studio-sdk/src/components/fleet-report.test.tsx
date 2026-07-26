import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { FleetReportSummary } from '@tai42/api-client';

import { FleetReport } from './fleet-report';

/** The status line that carries the given outcome label, with its mark and tone. */
function statusFor(alert: HTMLElement, label: RegExp): HTMLElement {
  const line = within(alert).getByText(label);
  expect(line).toHaveClass('tai-status');
  expect(line.querySelector('svg')).not.toBeNull();
  return line;
}

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
});

describe('FleetReport', () => {
  it('renders nothing for an absent report', () => {
    const { container } = render(<FleetReport summary={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a converged report (the caller shows its own success)', () => {
    const summary: FleetReportSummary = {
      status: 'converged',
      note: 'only this worker reloaded',
      failures: [],
      error: null,
    };
    const { container } = render(<FleetReport summary={summary} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a loud alert naming every non-converged origin and its outcome', () => {
    const summary: FleetReportSummary = {
      status: 'degraded',
      note: null,
      failures: [
        { origin: 'serve-a', outcome: 'failed', message: 'reload raised' },
        { origin: 'backend-b', outcome: 'timed_out', message: null },
        { origin: 'serve-c', outcome: 'departed', message: null },
        { origin: 'serve-d', outcome: 'missing', message: null },
      ],
      error: null,
    };
    render(<FleetReport summary={summary} />);
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText(/4 worker\(s\) did not converge/)).toBeInTheDocument();
    expect(within(alert).getByText('serve-a')).toBeInTheDocument();
    // The per-origin message (from error/detail) renders alongside the origin.
    expect(within(alert).getByText(/reload raised/)).toBeInTheDocument();
    expect(within(alert).getByText('backend-b')).toBeInTheDocument();
    expect(within(alert).getByText('serve-c')).toBeInTheDocument();
    expect(within(alert).getByText('serve-d')).toBeInTheDocument();
    // Each outcome label must match the bus semantics: `missing` is alive-but-silent
    // (never acked, still in the census), `timed_out` acked but did not finish applying.
    expect(within(alert).getByText(/apply failed/)).toBeInTheDocument();
    expect(within(alert).getByText(/acknowledged but did not finish applying/)).toBeInTheDocument();
    expect(within(alert).getByText(/left mid-broadcast/)).toBeInTheDocument();
    expect(within(alert).getByText(/alive but did not acknowledge in time/)).toBeInTheDocument();
  });

  it('gives every state a mark AND a label, never color alone', () => {
    const summary: FleetReportSummary = {
      status: 'degraded',
      note: null,
      failures: [
        { origin: 'serve-a', outcome: 'failed', message: null },
        { origin: 'backend-b', outcome: 'timed_out', message: null },
        { origin: 'serve-c', outcome: 'departed', message: null },
        { origin: 'serve-d', outcome: 'missing', message: null },
      ],
      error: null,
    };
    render(<FleetReport summary={summary} />);
    const alert = screen.getByRole('alert');

    // The headline: a degraded fleet is a warning.
    expect(statusFor(alert, /did not converge/)).toHaveClass('tai-status-warn');
    // `failed` is a definite negative; `departed` warns; the unresolved two are pending.
    expect(statusFor(alert, /^apply failed$/)).toHaveClass('tai-status-err');
    expect(statusFor(alert, /^left mid-broadcast$/)).toHaveClass('tai-status-warn');
    expect(statusFor(alert, /^acknowledged but did not finish applying$/)).toHaveClass(
      'tai-status-pending',
    );
    expect(statusFor(alert, /^alive but did not acknowledge in time$/)).toHaveClass(
      'tai-status-pending',
    );
  });

  it('marks an unreachable bus as an error state', () => {
    const summary: FleetReportSummary = {
      status: 'unreachable',
      note: null,
      failures: [],
      error: 'RedisConnectionError: connection refused',
    };
    render(<FleetReport summary={summary} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveClass('tai-error-state');
    expect(statusFor(alert, /was not reached/)).toHaveClass('tai-status-err');
    // The transport error is a raw payload — it renders on the terminal ground.
    expect(within(alert).getByText('RedisConnectionError: connection refused')).toHaveClass(
      'tai-code-block',
    );
  });

  it('renders a loud alert with the transport error when the bus was unreachable', () => {
    const summary: FleetReportSummary = {
      status: 'unreachable',
      note: null,
      failures: [],
      error: 'RedisConnectionError: connection refused',
    };
    render(<FleetReport summary={summary} />);
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText(/was not reached/)).toBeInTheDocument();
    expect(within(alert).getByText('RedisConnectionError: connection refused')).toBeInTheDocument();
  });

  it('omits the error line when an unreachable report carries no message', () => {
    const summary: FleetReportSummary = {
      status: 'unreachable',
      note: null,
      failures: [],
      error: null,
    };
    render(<FleetReport summary={summary} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('drops the "Change saved" framing and System-page pointer on a degraded reload action', () => {
    const summary: FleetReportSummary = {
      status: 'degraded',
      note: null,
      failures: [
        { origin: 'serve-a', outcome: 'failed', message: 'reload raised' },
        { origin: 'backend-b', outcome: 'timed_out', message: null },
      ],
      error: null,
    };
    render(<FleetReport summary={summary} action="reload" />);
    const alert = screen.getByRole('alert');
    // Nothing was saved on the reload surface, so the heading must not claim a save.
    expect(within(alert).getByText(/2 worker\(s\) did not converge/)).toBeInTheDocument();
    expect(within(alert).queryByText(/Change saved/)).not.toBeInTheDocument();
    // The operator is already on the System page — no self-referential pointer.
    expect(within(alert).queryByText(/from the System page/)).not.toBeInTheDocument();
    expect(within(alert).getByText(/re-run the reload to converge them/)).toBeInTheDocument();
    // The honest per-origin outcomes remain unchanged.
    expect(within(alert).getByText('serve-a')).toBeInTheDocument();
    expect(within(alert).getByText(/apply failed/)).toBeInTheDocument();
    expect(within(alert).getByText(/acknowledged but did not finish applying/)).toBeInTheDocument();
  });

  it('drops the "Change saved" framing and System-page pointer on an unreachable reload action', () => {
    const summary: FleetReportSummary = {
      status: 'unreachable',
      note: null,
      failures: [],
      error: 'RedisConnectionError: connection refused',
    };
    render(<FleetReport summary={summary} action="reload" />);
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText(/The worker fleet was not reached/)).toBeInTheDocument();
    expect(within(alert).queryByText(/Change saved/)).not.toBeInTheDocument();
    expect(within(alert).queryByText(/from the System page/)).not.toBeInTheDocument();
    expect(within(alert).getByText(/Re-run the reload once the bus is back/)).toBeInTheDocument();
    expect(within(alert).getByText('RedisConnectionError: connection refused')).toBeInTheDocument();
  });

  describe.each(['light', 'dark'] as const)('under the %s theme', (theme) => {
    it('keeps the alert, its mark and its per-origin labels', () => {
      document.documentElement.setAttribute('data-theme', theme);
      const summary: FleetReportSummary = {
        status: 'degraded',
        note: null,
        failures: [{ origin: 'serve-a', outcome: 'failed', message: null }],
        error: null,
      };
      render(<FleetReport summary={summary} />);
      const alert = screen.getByRole('alert');
      expect(alert).toHaveClass('tai-error-state');
      expect(statusFor(alert, /did not converge/)).toHaveClass('tai-status-warn');
      expect(statusFor(alert, /^apply failed$/)).toHaveClass('tai-status-err');
      expect(within(alert).getByText('serve-a')).toHaveClass('tai-mono');
    });
  });
});
