import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import QRModal from '@/components/ui/QRModal';
import QRCode from 'qrcode';

jest.mock('qrcode', () => ({
  __esModule: true,
  default: { toCanvas: jest.fn() },
}));

describe('QRModal', () => {
  const onClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing when closed', () => {
    const { container } = render(
      <QRModal isOpen={false} onClose={onClose} url="https://example.com" />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(QRCode.toCanvas).not.toHaveBeenCalled();
  });

  it('renders the QR canvas, url and default title when open', () => {
    render(
      <QRModal
        isOpen
        onClose={onClose}
        url="https://example.com/profile/123"
      />,
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Share via QR')).toBeInTheDocument();
    expect(
      screen.getByText('https://example.com/profile/123'),
    ).toBeInTheDocument();
    expect(QRCode.toCanvas).toHaveBeenCalledWith(
      expect.any(HTMLCanvasElement),
      'https://example.com/profile/123',
      { width: 240, margin: 2 },
    );
  });

  it('renders a custom title when provided', () => {
    render(
      <QRModal
        isOpen
        onClose={onClose}
        url="https://example.com"
        title="Custom Title"
      />,
    );

    expect(screen.getByText('Custom Title')).toBeInTheDocument();
    expect(screen.queryByText('Share via QR')).not.toBeInTheDocument();
  });

  it('regenerates the QR code when the url changes', () => {
    const { rerender } = render(
      <QRModal isOpen onClose={onClose} url="https://example.com/first" />,
    );
    expect(QRCode.toCanvas).toHaveBeenCalledTimes(1);

    rerender(
      <QRModal isOpen onClose={onClose} url="https://example.com/second" />,
    );

    expect(QRCode.toCanvas).toHaveBeenCalledTimes(2);
    expect(QRCode.toCanvas).toHaveBeenLastCalledWith(
      expect.any(HTMLCanvasElement),
      'https://example.com/second',
      { width: 240, margin: 2 },
    );
  });

  it('calls onClose when the modal is dismissed', () => {
    render(<QRModal isOpen onClose={onClose} url="https://example.com" />);

    fireEvent.click(screen.getByRole('button', { name: 'Close modal' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('downloads the QR code image when the download button is clicked', () => {
    const dataUrlSpy = jest
      .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockReturnValue('data:image/png;base64,abc');
    const clickSpy = jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    render(
      <QRModal isOpen onClose={onClose} url="https://example.com/profile" />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Download QR' }));

    expect(dataUrlSpy).toHaveBeenCalledWith('image/png');
    expect(clickSpy).toHaveBeenCalledTimes(1);

    dataUrlSpy.mockRestore();
    clickSpy.mockRestore();
  });
});
