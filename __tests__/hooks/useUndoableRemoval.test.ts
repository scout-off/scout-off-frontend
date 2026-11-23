import { renderHook, act } from '@testing-library/react';

jest.mock('@/components/ui/Toast', () => ({
  useToast: jest.fn(),
}));

import { useToast } from '@/components/ui/Toast';
import { useUndoableRemoval } from '@/hooks/useUndoableRemoval';

const mockUseToast = useToast as jest.Mock;

let show: jest.Mock;

function getUndoAction(): () => void {
  return show.mock.calls[show.mock.calls.length - 1][0].action.onClick;
}

beforeEach(() => {
  jest.useFakeTimers();
  show = jest.fn();
  mockUseToast.mockReturnValue({ show });
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
  jest.resetAllMocks();
});

describe('useUndoableRemoval', () => {
  it('applies the optimistic removal immediately and shows an Undo toast', () => {
    const { result } = renderHook(() => useUndoableRemoval());
    const onOptimisticRemove = jest.fn();

    act(() => {
      result.current({
        id: 1,
        message: 'Removed from watchlist',
        onOptimisticRemove,
        onRestore: jest.fn(),
        onCommit: jest.fn(),
      });
    });

    expect(onOptimisticRemove).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Removed from watchlist',
        duration: 5000,
        action: expect.objectContaining({ label: 'Undo' }),
      }),
    );
  });

  it('does not commit before the window elapses', () => {
    const { result } = renderHook(() => useUndoableRemoval());
    const onCommit = jest.fn();

    act(() => {
      result.current({
        id: 1,
        message: 'x',
        onOptimisticRemove: jest.fn(),
        onRestore: jest.fn(),
        onCommit,
      });
    });
    act(() => {
      jest.advanceTimersByTime(4999);
    });

    expect(onCommit).not.toHaveBeenCalled();
  });

  it('commits once the window elapses without an undo', () => {
    const { result } = renderHook(() => useUndoableRemoval());
    const onCommit = jest.fn();

    act(() => {
      result.current({
        id: 1,
        message: 'x',
        onOptimisticRemove: jest.fn(),
        onRestore: jest.fn(),
        onCommit,
      });
    });
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('undo before the window cancels the commit and restores prior state', () => {
    const { result } = renderHook(() => useUndoableRemoval());
    const onCommit = jest.fn();
    const onRestore = jest.fn();

    act(() => {
      result.current({
        id: 1,
        message: 'x',
        onOptimisticRemove: jest.fn(),
        onRestore,
        onCommit,
      });
    });
    act(() => {
      getUndoAction()();
    });
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(onCommit).not.toHaveBeenCalled();
    expect(onRestore).toHaveBeenCalledTimes(1);
  });

  it('undo after the window has already committed is a no-op', () => {
    const { result } = renderHook(() => useUndoableRemoval());
    const onCommit = jest.fn();
    const onRestore = jest.fn();

    act(() => {
      result.current({
        id: 1,
        message: 'x',
        onOptimisticRemove: jest.fn(),
        onRestore,
        onCommit,
      });
    });
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    act(() => {
      getUndoAction()();
    });

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onRestore).not.toHaveBeenCalled();
  });

  it('honors a custom window duration', () => {
    const { result } = renderHook(() => useUndoableRemoval(2000));
    const onCommit = jest.fn();

    act(() => {
      result.current({
        id: 1,
        message: 'x',
        onOptimisticRemove: jest.fn(),
        onRestore: jest.fn(),
        onCommit,
      });
    });
    act(() => {
      jest.advanceTimersByTime(1999);
    });
    expect(onCommit).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('ignores a second removal for an id that is already pending', () => {
    const { result } = renderHook(() => useUndoableRemoval());
    const onOptimisticRemove = jest.fn();

    act(() => {
      result.current({
        id: 1,
        message: 'x',
        onOptimisticRemove,
        onRestore: jest.fn(),
        onCommit: jest.fn(),
      });
      result.current({
        id: 1,
        message: 'x',
        onOptimisticRemove,
        onRestore: jest.fn(),
        onCommit: jest.fn(),
      });
    });

    expect(onOptimisticRemove).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledTimes(1);
  });
});
