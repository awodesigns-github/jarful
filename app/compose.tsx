import { PlaceholderScreen } from '@/components/PlaceholderScreen';

export default function Compose() {
  return <PlaceholderScreen id="compose" title="Add a note" label="Add a note" links={[{ href: "/", id: "close", text: "Close" }]} />;
}
