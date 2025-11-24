import { VVAULTRetrievalWrapper } from './vvaultRetrieval';

const buildResponse = (body: any, ok = true, status = 200): Response =>
  ({
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response);

describe('VVAULTRetrievalWrapper', () => {
  it('builds query with tone hints and tags', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(
      buildResponse({
        ok: true,
        memories: [],
      })
    );

    const wrapper = new VVAULTRetrievalWrapper({ baseUrl: 'https://vvault', fetcher: fetchMock });
    await wrapper.retrieveMemories({
      constructCallsign: 'katana-001',
      semanticQuery: 'devon trust anchors',
      toneHints: ['feral'],
      metadataTags: ['devon'],
      includeDiagnostics: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain('tone%20feral');
    expect(calledUrl).toContain('tags%20devon');
  });

  it('filters results using metadata tone tags', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(
      buildResponse({
        ok: true,
        memories: [
          {
            id: '1',
            response: 'Stay close.',
            metadata: { tone: 'protective' },
          },
          {
            id: '2',
            response: 'Rip them apart.',
            metadata: { tone: 'feral' },
          },
        ],
      })
    );

    const wrapper = new VVAULTRetrievalWrapper({ fetcher: fetchMock });
    const result = await wrapper.retrieveMemories({
      constructCallsign: 'katana-001',
      semanticQuery: 'safety protocol',
      toneHints: ['protective'],
    });

    expect(result.memories).toHaveLength(1);
    expect(result.memories[0].id).toBe('1');
    expect(result.memories[0].detectedTone?.tone).toBe('protective');
  });

  it('falls back to tone detection when metadata lacks tone', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(
      buildResponse({
        ok: true,
        memories: [
          {
            id: '3',
            response: 'Lock it down. Hold position now.',
          },
        ],
      })
    );

    const wrapper = new VVAULTRetrievalWrapper({ fetcher: fetchMock });
    const result = await wrapper.retrieveMemories({
      constructCallsign: 'katana-001',
      semanticQuery: 'orders',
      toneHints: ['directive'],
    });

    expect(result.memories).toHaveLength(1);
    expect(result.memories[0].detectedTone?.tone).toBe('directive');
  });

  it('throws when VVAULT responds with an error', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(buildResponse({ error: 'bad' }, false, 500));
    const wrapper = new VVAULTRetrievalWrapper({ fetcher: fetchMock });

    await expect(
      wrapper.retrieveMemories({
        constructCallsign: 'katana-001',
        semanticQuery: 'status',
      })
    ).rejects.toThrow('VVAULT retrieval failed');
  });
});
