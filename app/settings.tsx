import { PlaceholderScreen } from '@/components/PlaceholderScreen';

export default function Settings() {
  return <PlaceholderScreen id="settings" title="Settings" label="Settings" links={[{ href: "/", id: "home", text: "Back to jar" }]} />;
}
