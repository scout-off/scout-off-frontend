'use client';

import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { usePayToContact } from '@/hooks/usePayToContact';

interface ContactModalProps {
isOpen: boolean;
onClose: () => void;
playerId: string;
}

const ERROR_MESSAGES: Record<number, string> = {
7: 'Insufficient XLM balance to pay the contact fee.',
8: 'Your scout subscription has expired. Please renew.',
9: 'The contract is currently paused. Please try again later.',
};

export default function ContactModal({ isOpen, onClose, playerId }: ContactModalProps) {
const { unlock, loading, error } = usePayToContact(playerId);

const contactDetails = unlock?.contactDetails;

const handleCopy = (value: string) => {
navigator.clipboard.writeText(value);
};

const errorMessage = error?.code ? ERROR_MESSAGES[error.code] : error?.message;

return (
<Modal isOpen={isOpen} onClose={onClose}>
<div className="p-6 space-y-4">
<h2 className="text-lg font-semibold">Player Contact Details</h2>

{loading && (
<div className="flex justify-center py-6">
<Spinner />
</div>
)}

{errorMessage && (
<p className="text-red-500 text-sm">{errorMessage}</p>
)}

{contactDetails && !loading && (
<div className="space-y-3">
{contactDetails.email && (
<div className="flex items-center justify-between">
<span className="text-sm text-gray-600">Email: {contactDetails.email}</span>
<button
onClick={() => handleCopy(contactDetails.email)}
className="text-xs text-blue-500 hover:underline ml-2"
>
Copy
</button>
</div>
)}
{contactDetails.phone && (
<div className="flex items-center justify-between">
<span className="text-sm text-gray-600">Phone: {contactDetails.phone}</span>
<button
onClick={() => handleCopy(contactDetails.phone)}
className="text-xs text-blue-500 hover:underline ml-2"
>
Copy
</button>
</div>
)}
{contactDetails.telegram && (
<div className="flex items-center justify-between">
<span className="text-sm text-gray-600">Telegram: {contactDetails.telegram}</span>
<button
onClick={() => handleCopy(contactDetails.telegram)}
className="text-xs text-blue-500 hover:underline ml-2"
>
Copy
</button>
</div>
)}
</div>
)}
</div>
</Modal>
);
}
