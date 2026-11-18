import { PlaceholderScreen } from '@/components/PlaceholderScreen';

export default function Archive() {
  return <PlaceholderScreen id="archive" title="Archive" label="Archive of notes" links={[{ href: "/", id: "home", text: "Back to jar" }]} />;
}
