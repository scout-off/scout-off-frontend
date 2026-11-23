import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import '@testing-library/jest-dom';
import ChatThread from '@/components/messaging/ChatThread';
import {
  fetchThreadMessages,
  sendThreadMessage,
  ChatMessage,
} from '@/lib/messaging/chatApi';
import { reportThreadRead } from '@/lib/messaging/readReceipts';

jest.mock('@/lib/messaging/chatApi', () => ({
  fetchThreadMessages: jest.fn(),
  sendThreadMessage: jest.fn(),
}));

jest.mock('@/lib/messaging/readReceipts', () => ({
  reportThreadRead: jest.fn(),
}));

const mockedFetchThreadMessages = fetchThreadMessages as jest.MockedFunction<
  typeof fetchThreadMessages
>;
const mockedSendThreadMessage = sendThreadMessage as jest.MockedFunction<
  typeof sendThreadMessage
>;
const mockedReportThreadRead = reportThreadRead as jest.MockedFunction<
  typeof reportThreadRead
>;

const THREAD_ID = 'thread-1';
const POLL_INTERVAL_MS = 4000;

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    threadId: THREAD_ID,
    senderId: 'scout-1',
    body: 'Hello there',
    createdAt: '2026-08-01T00:00:00.000Z',
    status: 'sent',
    ...overrides,
  };
}

/** Flush the microtask queue inside act so async poll/send continuations run. */
async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('ChatThread', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedReportThreadRead.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows a loading indicator while the initial fetch is in flight', async () => {
    let resolveFetch: (value: ChatMessage[]) => void;
    mockedFetchThreadMessages.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );

    render(<ChatThread threadId={THREAD_ID} />);

    expect(screen.getByText('Loading conversation…')).toBeInTheDocument();

    await act(async () => {
      resolveFetch!([]);
    });

    await waitFor(() =>
      expect(
        screen.queryByText('Loading conversation…'),
      ).not.toBeInTheDocument(),
    );
  });

  it('marks the thread as read on mount', async () => {
    mockedFetchThreadMessages.mockResolvedValue([]);

    render(<ChatThread threadId={THREAD_ID} />);

    await waitFor(() =>
      expect(mockedReportThreadRead).toHaveBeenCalledWith(THREAD_ID),
    );
  });

  it('silently swallows a reportThreadRead failure', async () => {
    mockedFetchThreadMessages.mockResolvedValue([]);
    mockedReportThreadRead.mockRejectedValue(new Error('network error'));

    render(<ChatThread threadId={THREAD_ID} />);

    await waitFor(() =>
      expect(
        screen.getByText('No messages yet. Say hello!'),
      ).toBeInTheDocument(),
    );
  });

  it('shows an empty-state message when there are no messages', async () => {
    mockedFetchThreadMessages.mockResolvedValue([]);

    render(<ChatThread threadId={THREAD_ID} />);

    expect(
      await screen.findByText('No messages yet. Say hello!'),
    ).toBeInTheDocument();
  });

  it('renders fetched messages', async () => {
    mockedFetchThreadMessages.mockResolvedValue([
      makeMessage({ id: 'msg-1', body: 'Hi, interested in a trial?' }),
      makeMessage({ id: 'msg-2', body: 'Yes, when works?' }),
    ]);

    render(<ChatThread threadId={THREAD_ID} />);

    expect(
      await screen.findByText('Hi, interested in a trial?'),
    ).toBeInTheDocument();
    expect(screen.getByText('Yes, when works?')).toBeInTheDocument();
  });

  it('sends a message on button click and appends it to the list', async () => {
    mockedFetchThreadMessages.mockResolvedValue([]);
    const sent = makeMessage({ id: 'msg-new', body: 'Great, see you then' });
    mockedSendThreadMessage.mockResolvedValue(sent);

    render(<ChatThread threadId={THREAD_ID} />);
    await screen.findByText('No messages yet. Say hello!');

    const input = screen.getByPlaceholderText('Write a message…');
    fireEvent.change(input, { target: { value: 'Great, see you then' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    });

    expect(mockedSendThreadMessage).toHaveBeenCalledWith(
      THREAD_ID,
      'Great, see you then',
    );
    expect(screen.getByText('Great, see you then')).toBeInTheDocument();
    expect(input).toHaveValue('');
  });

  it('sends a message when pressing Enter in the input', async () => {
    mockedFetchThreadMessages.mockResolvedValue([]);
    mockedSendThreadMessage.mockResolvedValue(
      makeMessage({ id: 'msg-enter', body: 'Sent via enter' }),
    );

    render(<ChatThread threadId={THREAD_ID} />);
    await screen.findByText('No messages yet. Say hello!');

    const input = screen.getByPlaceholderText('Write a message…');
    fireEvent.change(input, { target: { value: 'Sent via enter' } });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });

    expect(mockedSendThreadMessage).toHaveBeenCalledWith(
      THREAD_ID,
      'Sent via enter',
    );
    expect(screen.getByText('Sent via enter')).toBeInTheDocument();
  });

  it('does not send when the draft is empty or whitespace only', async () => {
    mockedFetchThreadMessages.mockResolvedValue([]);

    render(<ChatThread threadId={THREAD_ID} />);
    await screen.findByText('No messages yet. Say hello!');

    const input = screen.getByPlaceholderText('Write a message…');
    fireEvent.change(input, { target: { value: '   ' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    });

    expect(mockedSendThreadMessage).not.toHaveBeenCalled();
  });

  it('polls for new messages on an interval', async () => {
    jest.useFakeTimers({ legacyFakeTimers: false });
    mockedFetchThreadMessages.mockResolvedValue([]);

    render(<ChatThread threadId={THREAD_ID} />);

    await flushPromises();
    expect(mockedFetchThreadMessages).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(POLL_INTERVAL_MS);
    });
    await flushPromises();
    expect(mockedFetchThreadMessages).toHaveBeenCalledTimes(2);

    await act(async () => {
      jest.advanceTimersByTime(POLL_INTERVAL_MS);
    });
    await flushPromises();
    expect(mockedFetchThreadMessages).toHaveBeenCalledTimes(3);
  });

  it('clears the pending poll timer on unmount', async () => {
    jest.useFakeTimers({ legacyFakeTimers: false });
    mockedFetchThreadMessages.mockResolvedValue([]);
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

    const { unmount } = render(<ChatThread threadId={THREAD_ID} />);
    await flushPromises();

    unmount();
    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it('reloads messages when threadId changes', async () => {
    mockedFetchThreadMessages.mockResolvedValue([]);

    const { rerender } = render(<ChatThread threadId={THREAD_ID} />);
    await screen.findByText('No messages yet. Say hello!');
    expect(mockedFetchThreadMessages).toHaveBeenCalledWith(
      THREAD_ID,
      expect.any(AbortSignal),
    );

    rerender(<ChatThread threadId="thread-2" />);
    await waitFor(() =>
      expect(mockedFetchThreadMessages).toHaveBeenCalledWith(
        'thread-2',
        expect.any(AbortSignal),
      ),
    );
  });

  it('ignores a stale poll response that resolves after a newer one', async () => {
    jest.useFakeTimers({ legacyFakeTimers: false });
    let resolveFirst!: (value: ChatMessage[]) => void;
    let resolveSecond!: (value: ChatMessage[]) => void;

    mockedFetchThreadMessages
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveSecond = resolve;
        }),
      );

    render(<ChatThread threadId={THREAD_ID} />);

    // Second poll fires on the normal cadence while the first is still in
    // flight — two overlapping requests are now outstanding.
    await act(async () => {
      jest.advanceTimersByTime(POLL_INTERVAL_MS);
    });

    // The newer response arrives first and is applied.
    await act(async () => {
      resolveSecond([makeMessage({ id: 'msg-2', body: 'Newest message' })]);
    });
    expect(screen.getByText('Newest message')).toBeInTheDocument();

    // The stale first response lands afterwards and must not overwrite it.
    await act(async () => {
      resolveFirst([makeMessage({ id: 'msg-1', body: 'Stale message' })]);
    });
    expect(screen.queryByText('Stale message')).not.toBeInTheDocument();
    expect(screen.getByText('Newest message')).toBeInTheDocument();
  });

  it('surfaces a poll failure and backs off exponentially until recovery', async () => {
    jest.useFakeTimers({ legacyFakeTimers: false });
    mockedFetchThreadMessages
      .mockRejectedValueOnce(new Error('network down'))
      .mockRejectedValueOnce(new Error('still down'))
      .mockResolvedValueOnce([]);

    render(<ChatThread threadId={THREAD_ID} />);
    await flushPromises();

    // Initial failure: a distinct error/retry state, not a stuck loader.
    expect(
      screen.getByText("Couldn't load the conversation."),
    ).toBeInTheDocument();
    expect(screen.queryByText('Loading conversation…')).not.toBeInTheDocument();

    // First retry fires at the base interval and fails again.
    await act(async () => {
      jest.advanceTimersByTime(POLL_INTERVAL_MS);
    });
    await flushPromises();
    expect(mockedFetchThreadMessages).toHaveBeenCalledTimes(2);

    // Backoff: the next retry is scheduled at 2× the base interval, so
    // nothing fires 4s after the second failure…
    await act(async () => {
      jest.advanceTimersByTime(POLL_INTERVAL_MS);
    });
    await flushPromises();
    expect(mockedFetchThreadMessages).toHaveBeenCalledTimes(2);

    // …and the retry lands at the 8s mark, then recovers and clears the error.
    await act(async () => {
      jest.advanceTimersByTime(POLL_INTERVAL_MS);
    });
    await flushPromises();
    expect(mockedFetchThreadMessages).toHaveBeenCalledTimes(3);

    await waitFor(() =>
      expect(
        screen.queryByText("Couldn't load the conversation."),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByText('No messages yet. Say hello!')).toBeInTheDocument();
  });

  it('shows an inline connection-lost banner when a poll fails after data loaded', async () => {
    jest.useFakeTimers({ legacyFakeTimers: false });
    mockedFetchThreadMessages
      .mockResolvedValueOnce([makeMessage({ id: 'msg-1', body: 'Existing' })])
      .mockRejectedValueOnce(new Error('network down'));

    render(<ChatThread threadId={THREAD_ID} />);
    await flushPromises();
    expect(screen.getByText('Existing')).toBeInTheDocument();

    await act(async () => {
      jest.advanceTimersByTime(POLL_INTERVAL_MS);
    });
    await flushPromises();

    // Existing messages stay visible, with a distinct retry affordance.
    expect(screen.getByText('Existing')).toBeInTheDocument();
    expect(screen.getByText('Connection lost — retrying…')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Retry now' }),
    ).toBeInTheDocument();
  });

  it('keeps the draft and shows an error when a send fails, then retries without retyping', async () => {
    mockedFetchThreadMessages.mockResolvedValue([]);
    mockedSendThreadMessage
      .mockRejectedValueOnce(new Error('send failed'))
      .mockResolvedValueOnce(makeMessage({ id: 'msg-new', body: 'Keep me' }));

    render(<ChatThread threadId={THREAD_ID} />);
    await screen.findByText('No messages yet. Say hello!');

    const input = screen.getByPlaceholderText('Write a message…');
    fireEvent.change(input, { target: { value: 'Keep me' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    });

    // Failure: the draft is preserved and a clear error with retry is shown.
    expect(mockedSendThreadMessage).toHaveBeenCalledWith(THREAD_ID, 'Keep me');
    expect(input).toHaveValue('Keep me');
    expect(
      screen.getByText(
        "Couldn't send your message. Check your connection and try again.",
      ),
    ).toBeInTheDocument();

    // Retry sends the same text without the user having to retype it.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    });

    expect(mockedSendThreadMessage).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Keep me')).toBeInTheDocument();
    expect(input).toHaveValue('');
    expect(
      screen.queryByText(
        "Couldn't send your message. Check your connection and try again.",
      ),
    ).not.toBeInTheDocument();
  });

  it('renders delivered/read indicators on the current user’s messages and updates with status changes', async () => {
    jest.useFakeTimers({ legacyFakeTimers: false });
    mockedFetchThreadMessages.mockResolvedValue([
      makeMessage({
        id: 'mine-1',
        senderId: 'me',
        body: 'Hey',
        status: 'sent',
      }),
      makeMessage({
        id: 'theirs-1',
        senderId: 'scout-1',
        body: 'Hi',
        status: 'read',
      }),
    ]);

    render(<ChatThread threadId={THREAD_ID} currentUserId="me" />);
    await flushPromises();

    // A 'sent' own message shows no indicator, and the other party's status
    // is never rendered (we can't know their delivery state).
    expect(screen.getByText('Hey')).toBeInTheDocument();
    expect(screen.queryByLabelText('Delivered')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Read')).not.toBeInTheDocument();

    // A poll brings an updated status for the own message.
    mockedFetchThreadMessages.mockResolvedValue([
      makeMessage({
        id: 'mine-1',
        senderId: 'me',
        body: 'Hey',
        status: 'read',
      }),
      makeMessage({
        id: 'theirs-1',
        senderId: 'scout-1',
        body: 'Hi',
        status: 'read',
      }),
    ]);

    await act(async () => {
      jest.advanceTimersByTime(POLL_INTERVAL_MS);
    });
    await flushPromises();

    expect(screen.getByLabelText('Read')).toBeInTheDocument();
  });

  it('pauses polling while the document is hidden and refreshes on visibility return', async () => {
    jest.useFakeTimers({ legacyFakeTimers: false });
    mockedFetchThreadMessages.mockResolvedValue([]);

    render(<ChatThread threadId={THREAD_ID} />);
    await flushPromises();
    expect(mockedFetchThreadMessages).toHaveBeenCalledTimes(1);

    const visibilitySpy = jest.spyOn(document, 'visibilityState', 'get');
    visibilitySpy.mockReturnValue('hidden');

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // No polling happens while hidden, no matter how long the tab is away.
    await act(async () => {
      jest.advanceTimersByTime(20_000);
    });
    await flushPromises();
    expect(mockedFetchThreadMessages).toHaveBeenCalledTimes(1);

    // Returning to the visible tab triggers an immediate refresh…
    visibilitySpy.mockReturnValue('visible');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await flushPromises();
    expect(mockedFetchThreadMessages).toHaveBeenCalledTimes(2);

    // …and polling resumes at the normal cadence.
    await act(async () => {
      jest.advanceTimersByTime(POLL_INTERVAL_MS);
    });
    await flushPromises();
    expect(mockedFetchThreadMessages).toHaveBeenCalledTimes(3);

    visibilitySpy.mockRestore();
  });

  it('renders the correct indicator for each of the three message statuses on the current user’s messages', async () => {
    mockedFetchThreadMessages.mockResolvedValue([
      makeMessage({ id: 'm-sent', senderId: 'me', body: 'A', status: 'sent' }),
      makeMessage({
        id: 'm-delivered',
        senderId: 'me',
        body: 'B',
        status: 'delivered',
      }),
      makeMessage({ id: 'm-read', senderId: 'me', body: 'C', status: 'read' }),
      makeMessage({
        id: 'm-theirs',
        senderId: 'other',
        body: 'D',
        status: 'read',
      }),
    ]);

    render(<ChatThread threadId={THREAD_ID} currentUserId="me" />);
    await flushPromises();

    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getByText('C')).toBeInTheDocument();
    expect(screen.getByText('D')).toBeInTheDocument();

    // 'sent' shows no indicator; 'delivered' and 'read' show their labels.
    expect(screen.getByLabelText('Delivered')).toBeInTheDocument();
    expect(screen.getByLabelText('Read')).toBeInTheDocument();

    // Only the current user's delivered/read messages get an indicator; the
    // sent own message and the other participant's message show none.
    expect(screen.getAllByLabelText(/Delivered|Read/)).toHaveLength(2);
  });
});
