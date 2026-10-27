/** The Storage screen's detail and doors: which API each action goes through for a
 * given projection and set of mounted surfaces, each entry kind's body, and the
 * entry read's failure states. */
import { ApiError, type MeProjection } from '@tai42/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';

import { StoragePage } from './StoragePage';
import {
  fullProjection,
  renderWithProviders,
  scopedProjection,
  type StubApiClient,
} from './test-utils';

afterEach(() => {
  vi.clearAllMocks();
  globalThis.localStorage.clear();
});

type Surface = 'storage' | 'templates';

function info(surfaces: readonly Surface[] = ['storage', 'templates']) {
  return {
    present: true as const,
    provider: 'LocalStorage',
    module: 'plugin.storage',
    surfaces: [...surfaces],
  };
}

const text = {
  kind: 'text' as const,
  id: 'welcome.md',
  content_type: 'text/markdown',
  size: 12,
  content: 'Hello {{ name }}',
};
const templateText = { ...text, schema: {}, schema_error: null };
const binary = { kind: 'binary' as const, id: 'logo.png', content_type: 'image/png', size: 2048 };
const pdf = {
  kind: 'document' as const,
  id: 'docs/guide.pdf',
  content_type: 'application/pdf',
  size: 4096,
  content: 'Extracted guide text',
};

const TEMPLATES_WRITE: readonly (readonly [string, string])[] = [
  ['GET', '/api/templates'],
  ['POST', '/api/template'],
  ['POST', '/api/upload-template'],
  ['POST', '/api/delete-template'],
  ['POST', '/api/delete-template-dir'],
  ['POST', '/api/render-template'],
  ['POST', '/api/clear-templates-cache'],
];

const STORAGE_ONLY: readonly (readonly [string, string])[] = [
  ['GET', '/api/storage/resources'],
  ['POST', '/api/storage/resources'],
];

/** The 501 message a deployment without the files extra answers. */
const FILES_OFF =
  "tai42-skeleton 'files' resource loading requires the 'files' optional dependencies (magika, pandas, " +
  'langchain-community, pypdf, docx2txt, openpyxl, tabulate, beautifulsoup4, python-pptx, striprtf, odfpy, ' +
  "ebooklib). Install them with: pip install 'tai42-skeleton[files]'";

function renderDetail(
  client: StubApiClient,
  {
    id = text.id,
    projection = fullProjection(),
    navigate = vi.fn(),
  }: {
    /** The `?id=` selection; `null` opens the list with nothing selected. */
    id?: string | null;
    projection?: MeProjection;
    navigate?: Mock;
  } = {},
) {
  return renderWithProviders(<StoragePage search={id === null ? {} : { id }} />, {
    client,
    projection,
    navigate,
  });
}

function detailRegion(id: string): HTMLElement {
  return screen.getByRole('region', { name: id });
}

describe('Storage detail: entry kinds', () => {
  it('a text entry shows Content, Render preview, Download and Delete', async () => {
    renderDetail({
      getStorageInfo: vi.fn().mockResolvedValue(info()),
      listStorageResources: vi.fn().mockResolvedValue({ resources: [text.id] }),
      readStorageResource: vi.fn().mockResolvedValue(text),
    });

    expect(await screen.findByRole('heading', { name: 'Content' })).toBeInTheDocument();
    const region = detailRegion(text.id);
    expect(within(region).getByText('Hello {{ name }}')).toBeInTheDocument();
    expect(within(region).getByText('Text')).toBeInTheDocument();
    expect(within(region).getByRole('heading', { name: 'Render preview' })).toBeInTheDocument();
    expect(within(region).getByRole('button', { name: `Download ${text.id}` })).toBeInTheDocument();
    expect(within(region).getByRole('button', { name: `Delete ${text.id}` })).toBeInTheDocument();
  });

  it('a binary entry shows the no-preview line and Download, with no preview', async () => {
    renderDetail(
      {
        getStorageInfo: vi.fn().mockResolvedValue(info()),
        listStorageResources: vi.fn().mockResolvedValue({ resources: [binary.id] }),
        readStorageResource: vi.fn().mockResolvedValue(binary),
      },
      { id: binary.id },
    );

    expect(await screen.findByText('Binary object: no text preview.')).toBeInTheDocument();
    const region = detailRegion(binary.id);
    expect(within(region).getByText('Binary')).toBeInTheDocument();
    expect(within(region).getByText(/2\.0 KB/)).toBeInTheDocument();
    expect(
      within(region).getByRole('button', { name: `Download ${binary.id}` }),
    ).toBeInTheDocument();
    expect(within(region).queryByRole('heading', { name: 'Content' })).not.toBeInTheDocument();
    expect(
      within(region).queryByRole('heading', { name: 'Render preview' }),
    ).not.toBeInTheDocument();
  });

  it('a document entry shows its extracted text and no render preview or no-grant line', async () => {
    renderDetail(
      {
        getStorageInfo: vi.fn().mockResolvedValue(info()),
        listStorageResources: vi.fn().mockResolvedValue({ resources: [pdf.id] }),
        readStorageResource: vi.fn().mockResolvedValue(pdf),
      },
      { id: pdf.id },
    );

    expect(await screen.findByText('Extracted guide text')).toBeInTheDocument();
    const region = detailRegion(pdf.id);
    expect(within(region).getByText('Document')).toBeInTheDocument();
    expect(
      within(region).getByText('Extracted text; this object is not a template.'),
    ).toBeInTheDocument();
    expect(within(region).getByRole('button', { name: `Download ${pdf.id}` })).toBeInTheDocument();
    expect(within(region).getByRole('button', { name: `Delete ${pdf.id}` })).toBeInTheDocument();
    expect(
      within(region).queryByRole('heading', { name: 'Render preview' }),
    ).not.toBeInTheDocument();
    expect(within(region).queryByRole('status')).not.toBeInTheDocument();
  });

  it('broken Jinja shows the content, the template error and a disabled Render', async () => {
    renderDetail(
      {
        getStorageInfo: vi.fn().mockResolvedValue(info(['templates'])),
        listTemplates: vi.fn().mockResolvedValue([text.id]),
        getTemplate: vi.fn().mockResolvedValue({
          ...templateText,
          content: 'Hello {{ name }',
          schema: null,
          schema_error: "template error: unexpected '}'",
        }),
      },
      { projection: fullProjection() },
    );

    expect(await screen.findByText('Hello {{ name }')).toBeInTheDocument();
    const region = detailRegion(text.id);
    expect(within(region).getByRole('alert')).toHaveTextContent("template error: unexpected '}'");
    expect(within(region).getByRole('button', { name: 'Render' })).toBeDisabled();
    expect(
      within(region).getByText('Fix the template error above to preview it.'),
    ).toBeInTheDocument();
    expect(within(region).getByRole('button', { name: `Delete ${text.id}` })).toBeInTheDocument();
  });
});

describe('Storage detail: doors by projection and surfaces', () => {
  it('a templates-write-only projection works through the templates doors and offers no Download', async () => {
    const listTemplates = vi.fn().mockResolvedValue([text.id]);
    const getTemplate = vi.fn().mockResolvedValue(templateText);
    renderDetail(
      {
        getStorageInfo: vi.fn().mockResolvedValue(info()),
        listTemplates,
        getTemplate,
      },
      { projection: scopedProjection(TEMPLATES_WRITE) },
    );

    expect(await screen.findByRole('heading', { name: 'Render preview' })).toBeInTheDocument();
    expect(listTemplates).toHaveBeenCalled();
    expect(getTemplate).toHaveBeenCalledWith(text.id);
    const region = detailRegion(text.id);
    expect(within(region).getByRole('button', { name: `Delete ${text.id}` })).toBeInTheDocument();
    expect(within(region).queryByRole('button', { name: /^Download/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear cache' })).toBeInTheDocument();
  });

  it('a templates-write-only upload blocks a file that is not UTF-8 text', async () => {
    const user = userEvent.setup();
    const uploadTemplate = vi.fn();
    renderDetail(
      {
        getStorageInfo: vi.fn().mockResolvedValue(info()),
        listTemplates: vi.fn().mockResolvedValue([]),
        uploadTemplate,
      },
      { id: null, projection: scopedProjection(TEMPLATES_WRITE) },
    );

    await user.click(await screen.findByRole('button', { name: 'Upload' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('radio', { name: 'Files' }));
    await user.upload(
      within(dialog).getByLabelText('Choose files'),
      new File([new Uint8Array([0xff, 0xfe, 0x00])], 'logo.png', { type: 'image/png' }),
    );
    const submit = within(dialog).getByRole('button', { name: 'Upload' });
    await waitFor(() => {
      expect(submit).toBeEnabled();
    });
    await user.click(submit);

    expect(
      await within(dialog).findByText(
        'These files are not UTF-8 text: logo.png. Your access stores text only; ask for the storage grant to upload other files.',
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Upload' })).toBeDisabled();
    expect(uploadTemplate).not.toHaveBeenCalled();
  });

  it('a templates-read-only projection lists and shows the no-grant detail line', async () => {
    const getTemplate = vi.fn();
    renderDetail(
      {
        getStorageInfo: vi.fn().mockResolvedValue(info()),
        listTemplates: vi.fn().mockResolvedValue([text.id]),
        getTemplate,
      },
      { projection: scopedProjection([['GET', '/api/templates']]) },
    );

    expect(await screen.findByRole('link', { name: `Open ${text.id}` })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Opening a stored object needs the storage read grant or the templates write grant.',
      ),
    ).toBeInTheDocument();
    expect(getTemplate).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Upload' })).not.toBeInTheDocument();
  });

  it('a storage-only projection shows the render no-grant line and no Clear cache', async () => {
    renderDetail(
      {
        getStorageInfo: vi.fn().mockResolvedValue(info()),
        listStorageResources: vi.fn().mockResolvedValue({ resources: [text.id] }),
        readStorageResource: vi.fn().mockResolvedValue(text),
      },
      { projection: scopedProjection(STORAGE_ONLY) },
    );

    expect(
      await screen.findByText(
        'Render preview is outside your access — it needs the templates write grant.',
      ),
    ).toHaveAttribute('role', 'status');
    expect(screen.queryByRole('heading', { name: 'Render preview' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear cache' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload' })).toBeInTheDocument();
  });

  it("a full projection on surfaces ['templates'] lists and reads through the templates doors", async () => {
    const listTemplates = vi.fn().mockResolvedValue([text.id]);
    const getTemplate = vi.fn().mockResolvedValue(templateText);
    renderDetail({
      getStorageInfo: vi.fn().mockResolvedValue(info(['templates'])),
      listTemplates,
      getTemplate,
    });

    expect(await screen.findByRole('heading', { name: 'Render preview' })).toBeInTheDocument();
    expect(listTemplates).toHaveBeenCalled();
    expect(getTemplate).toHaveBeenCalledWith(text.id);
    expect(screen.queryByRole('button', { name: /^Download/ })).not.toBeInTheDocument();
  });

  it("a full projection on surfaces ['storage'] reads through the storage door with no render", async () => {
    const readStorageResource = vi.fn().mockResolvedValue(text);
    renderDetail({
      getStorageInfo: vi.fn().mockResolvedValue(info(['storage'])),
      listStorageResources: vi.fn().mockResolvedValue({ resources: [text.id] }),
      readStorageResource,
    });

    expect(await screen.findByRole('heading', { name: 'Content' })).toBeInTheDocument();
    expect(readStorageResource).toHaveBeenCalledWith(text.id, expect.any(AbortSignal));
    expect(screen.queryByRole('heading', { name: 'Render preview' })).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear cache' })).not.toBeInTheDocument();
  });

  it('no mounted surface shows the not-served empty state', async () => {
    renderDetail({ getStorageInfo: vi.fn().mockResolvedValue(info([])) });

    expect(await screen.findByText('Storage is not served here')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Upload' })).not.toBeInTheDocument();
  });

  it('file rows carry no action buttons; a folder row carries its Delete directory', async () => {
    renderDetail(
      {
        getStorageInfo: vi.fn().mockResolvedValue(info()),
        listStorageResources: vi.fn().mockResolvedValue({ resources: ['a.txt', 'jq/gate'] }),
      },
      { id: null },
    );

    const table = await screen.findByRole('table');
    expect(within(table).getByRole('link', { name: 'Open a.txt' })).toBeInTheDocument();
    expect(within(table).queryByRole('button', { name: /a\.txt/ })).not.toBeInTheDocument();
    expect(within(table).getByRole('button', { name: 'Delete directory jq' })).toBeInTheDocument();
  });
});

describe('Storage detail: navigation and header actions', () => {
  it('a ?id= deep link opens the detail', async () => {
    renderDetail({
      getStorageInfo: vi.fn().mockResolvedValue(info()),
      listStorageResources: vi.fn().mockResolvedValue({ resources: [text.id] }),
      readStorageResource: vi.fn().mockResolvedValue(text),
    });

    expect(await screen.findByRole('heading', { level: 2, name: text.id })).toBeInTheDocument();
    const link = await screen.findByRole('link', { name: `Open ${text.id}` });
    expect(link).toHaveAttribute('aria-current', 'page');
    // The open object's row carries the shared selected look.
    expect(link.closest('tr')).toHaveAttribute('data-selected', 'true');
  });

  it('a missing object shows the not-found state and its Back link', async () => {
    renderDetail(
      {
        getStorageInfo: vi.fn().mockResolvedValue(info()),
        listStorageResources: vi.fn().mockResolvedValue({ resources: [] }),
        readStorageResource: vi.fn().mockRejectedValue(new ApiError('not found', 404)),
      },
      { id: 'gone.md' },
    );

    expect(await screen.findByText('Resource gone.md not found.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to all resources' })).toHaveAttribute(
      'href',
      '/storage',
    );
  });

  it('Clear cache announces its success', async () => {
    const user = userEvent.setup();
    const clearTemplatesCache = vi.fn().mockResolvedValue({ cleared: true });
    renderDetail(
      {
        getStorageInfo: vi.fn().mockResolvedValue(info()),
        listStorageResources: vi.fn().mockResolvedValue({ resources: [] }),
        clearTemplatesCache,
      },
      { id: null },
    );

    await user.click(await screen.findByRole('button', { name: 'Clear cache' }));

    expect(await screen.findByText('Template cache cleared.')).toHaveAttribute('role', 'status');
    expect(clearTemplatesCache).toHaveBeenCalledTimes(1);
  });
});

describe('Storage detail: entry read failures', () => {
  it('the actions row stands while the entry is pending', async () => {
    renderDetail({
      getStorageInfo: vi.fn().mockResolvedValue(info()),
      listStorageResources: vi.fn().mockResolvedValue({ resources: [text.id] }),
      readStorageResource: vi.fn().mockReturnValue(new Promise(() => undefined)),
    });

    expect(await screen.findByRole('button', { name: `Download ${text.id}` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Delete ${text.id}` })).toBeInTheDocument();
  });

  it('a 400 on the templates entry door shows the error, no Retry, and keeps Delete', async () => {
    renderDetail(
      {
        getStorageInfo: vi.fn().mockResolvedValue(info()),
        listTemplates: vi.fn().mockResolvedValue([text.id]),
        getTemplate: vi.fn().mockRejectedValue(new ApiError('bad template id', 400)),
      },
      { projection: scopedProjection(TEMPLATES_WRITE) },
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('bad template id');
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Delete ${text.id}` })).toBeInTheDocument();
  });

  it('a refused object shows no dead-end Retry and keeps Download and Delete', async () => {
    const message =
      "resource 'docs/locked.pdf' cannot be loaded: 'docs/locked.pdf' could not be extracted as pdf: FileNotDecryptedError: File has not been decrypted";
    renderDetail(
      {
        getStorageInfo: vi.fn().mockResolvedValue(info()),
        listStorageResources: vi.fn().mockResolvedValue({ resources: ['docs/locked.pdf'] }),
        readStorageResource: vi.fn().mockRejectedValue(new ApiError(message, 400)),
      },
      { id: 'docs/locked.pdf' },
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download docs/locked.pdf' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete docs/locked.pdf' })).toBeInTheDocument();
  });

  it('a server fault offers Retry, which re-requests the entry', async () => {
    const user = userEvent.setup();
    const readStorageResource = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('internal error', 500))
      .mockResolvedValue(text);
    renderDetail({
      getStorageInfo: vi.fn().mockResolvedValue(info()),
      listStorageResources: vi.fn().mockResolvedValue({ resources: [text.id] }),
      readStorageResource,
    });

    await user.click(await screen.findByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('heading', { name: 'Content' })).toBeInTheDocument();
    expect(readStorageResource).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['storage', 'readStorageResource'],
    ['templates', 'getTemplate'],
  ] as const)(
    'a deployment without the files extra shows the off note on the %s door',
    async (surface, method) => {
      const off = new ApiError(FILES_OFF, 501, 'files-not-configured');
      const client: StubApiClient =
        surface === 'storage'
          ? {
              getStorageInfo: vi.fn().mockResolvedValue(info(['storage'])),
              listStorageResources: vi.fn().mockResolvedValue({ resources: [text.id] }),
              downloadStorageResource: vi.fn(),
            }
          : {
              getStorageInfo: vi.fn().mockResolvedValue(info(['templates'])),
              listTemplates: vi.fn().mockResolvedValue([text.id]),
            };
      renderDetail({ ...client, [method]: vi.fn().mockRejectedValue(off) });

      const note = await screen.findByTestId('feature-disabled');
      expect(within(note).getByText('File loading is not configured')).toBeInTheDocument();
      expect(within(note).getByText(FILES_OFF)).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: `Delete ${text.id}` })).toBeInTheDocument();
      if (surface === 'storage') {
        expect(screen.getByRole('button', { name: `Download ${text.id}` })).toBeInTheDocument();
      }
    },
  );
});

describe('Storage detail: upload and held deletes', () => {
  it.each(['storage', 'templates'] as const)(
    'the Text upload on the %s door shows the server 400 verbatim',
    async (surface) => {
      const user = userEvent.setup();
      const message = "invalid resource id 'a//b': empty path segment";
      const refusal = vi.fn().mockRejectedValue(new ApiError(message, 400));
      renderDetail(
        surface === 'storage'
          ? {
              getStorageInfo: vi.fn().mockResolvedValue(info(['storage'])),
              listStorageResources: vi.fn().mockResolvedValue({ resources: [] }),
              uploadStorageResource: refusal,
            }
          : {
              getStorageInfo: vi.fn().mockResolvedValue(info(['templates'])),
              listTemplates: vi.fn().mockResolvedValue([]),
              uploadTemplate: refusal,
            },
        { id: null },
      );

      await user.click(await screen.findByRole('button', { name: 'Upload' }));
      const dialog = await screen.findByRole('dialog');
      await user.type(within(dialog).getByLabelText('Resource id'), 'a//b');
      await user.type(within(dialog).getByLabelText('Text content'), 'x');
      await user.click(within(dialog).getByRole('button', { name: 'Upload' }));

      expect(await within(dialog).findByText(message)).toBeInTheDocument();
    },
  );

  function held(subject: string, headline: string): ApiError {
    const message = `${headline}\n  hook 'h' names 'jq/gate' at condition`;
    return new ApiError(message, 409, undefined, undefined, {
      error: message,
      holders: [
        {
          kind: 'hook',
          tag: 'hooks',
          name: 'h',
          locator: {},
          summary: `hook 'h' names '${subject}' at condition`,
        },
      ],
    });
  }

  it.each([
    ['storage', 'deleteStorageResource'],
    ['templates', 'deleteTemplate'],
  ] as const)(
    'a held object delete on the %s door lists its holders and a retry closes it',
    async (surface, method) => {
      const user = userEvent.setup();
      const headline = "stored template 'jq/gate' cannot be deleted — held by:";
      const remove = vi
        .fn()
        .mockRejectedValueOnce(held('jq/gate', headline))
        .mockResolvedValue({ deleted: true });
      const navigate = vi.fn();
      renderDetail(
        surface === 'storage'
          ? {
              getStorageInfo: vi.fn().mockResolvedValue(info(['storage'])),
              listStorageResources: vi.fn().mockResolvedValue({ resources: ['jq/gate'] }),
              readStorageResource: vi.fn().mockResolvedValue({ ...text, id: 'jq/gate' }),
              [method]: remove,
            }
          : {
              getStorageInfo: vi.fn().mockResolvedValue(info(['templates'])),
              listTemplates: vi.fn().mockResolvedValue(['jq/gate']),
              getTemplate: vi.fn().mockResolvedValue({ ...templateText, id: 'jq/gate' }),
              [method]: remove,
            },
        { id: 'jq/gate', navigate },
      );

      await user.click(await screen.findByRole('button', { name: 'Delete jq/gate' }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

      expect(await within(dialog).findByText(headline)).toBeInTheDocument();
      expect(within(dialog).getByText('Still used by — remove these first:')).toBeInTheDocument();
      const list = within(dialog).getByRole('list', { name: 'Holders of jq/gate' });
      const link = within(list).getByRole('link', {
        name: "hook 'h' names 'jq/gate' at condition",
      });
      expect(link).toHaveAttribute('href', expect.stringMatching(/^\/hooks/));

      await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(remove).toHaveBeenCalledTimes(2);
    },
  );

  it('a held directory delete lists its holders', async () => {
    const user = userEvent.setup();
    const headline = "directory 'jq' cannot be deleted — held by:";
    renderDetail(
      {
        getStorageInfo: vi.fn().mockResolvedValue(info(['storage'])),
        listStorageResources: vi.fn().mockResolvedValue({ resources: ['jq/gate'] }),
        deleteStorageDir: vi.fn().mockRejectedValue(held('jq/gate', headline)),
      },
      { id: null },
    );

    await user.click(await screen.findByRole('button', { name: 'Delete directory jq' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete directory' }));

    expect(await within(dialog).findByText(headline)).toBeInTheDocument();
    expect(within(dialog).getByRole('list', { name: 'Holders of jq' })).toBeInTheDocument();
  });

  it.each([
    ['a 409 without holders', new ApiError("resource 'a.txt' is locked\n  by a writer", 409)],
    ['a 500', new ApiError('storage failed\n  disk full', 500)],
  ])('%s shows the whole message and no holder list', async (_name, refusal) => {
    const user = userEvent.setup();
    renderDetail(
      {
        getStorageInfo: vi.fn().mockResolvedValue(info(['storage'])),
        listStorageResources: vi.fn().mockResolvedValue({ resources: ['a.txt'] }),
        readStorageResource: vi.fn().mockResolvedValue({ ...text, id: 'a.txt' }),
        deleteStorageResource: vi.fn().mockRejectedValue(refusal),
      },
      { id: 'a.txt' },
    );

    await user.click(await screen.findByRole('button', { name: 'Delete a.txt' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert.textContent).toContain(refusal.message.split('\n')[1]?.trim());
    expect(within(dialog).queryByRole('list')).not.toBeInTheDocument();
  });
});
