import { labelUserAgent, parseUserAgent } from '@/lib/userAgentLabel';

describe('labelUserAgent', () => {
  it('labels Chrome on Android', () => {
    expect(
      labelUserAgent(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
      ),
    ).toBe('Chrome on Android');
  });

  it('labels Safari on iOS', () => {
    expect(
      labelUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('Safari on iPhone');
  });

  it('labels Firefox on Windows', () => {
    expect(
      labelUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
      ),
    ).toBe('Firefox on Windows');
  });

  it('labels Edge on macOS ahead of its Chrome/Safari tokens', () => {
    expect(
      labelUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.2478.80',
      ),
    ).toBe('Edge on macOS');
  });

  it.each([null, undefined, ''])(
    'falls back to a generic label for %p',
    (ua) => {
      expect(labelUserAgent(ua)).toBe('Unknown device');
    },
  );

  it('labels an unrecognised UA as unknown browser and OS', () => {
    expect(labelUserAgent('curl/8.4.0')).toBe('Unknown browser on Unknown OS');
  });

  // #1779: both send a Chrome/ token, so they must be matched first.
  it('recognises Samsung Internet on Android', () => {
    expect(
      parseUserAgent(
        'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36',
      ),
    ).toEqual({ browser: 'Samsung Internet', os: 'Android' });
  });

  it('recognises UC Browser on Android', () => {
    expect(
      parseUserAgent(
        'Mozilla/5.0 (Linux; U; Android 10; en-US; RMX2185) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/78.0.3904.108 UCBrowser/13.4.0.1306 Mobile Safari/537.36',
      ),
    ).toEqual({ browser: 'UC Browser', os: 'Android' });
  });
});
