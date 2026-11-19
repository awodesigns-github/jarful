import { PlaceholderScreen } from '@/components/PlaceholderScreen';

// Placeholder. Sign-in, backup and delete account arrive in the next phase.
export default function Account() {
  return <PlaceholderScreen id="account" title="Account" label="Account" links={[{ href: '/settings', id: 'settings', text: 'Back to settings' }]} />;
}
