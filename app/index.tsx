import { PlaceholderScreen } from '@/components/PlaceholderScreen';

export default function Home() {
  return <PlaceholderScreen id="index" title="Jarful" label="Home, your jar" links={[{ href: "/compose", id: "compose", text: "Add a note" }, { href: "/archive", id: "archive", text: "Archive" }, { href: "/settings", id: "settings", text: "Settings" }]} />;
}
