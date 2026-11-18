import { PlaceholderScreen } from '@/components/PlaceholderScreen';
import { M0TestNotes } from '@/components/M0TestNotes';

export default function Home() {
  return (
    <PlaceholderScreen
      id="index"
      title="Jarful"
      label="Home, your jar"
      links={[{ href: "/compose", id: "compose", text: "Add a note" }, { href: "/archive", id: "archive", text: "Archive" }, { href: "/settings", id: "settings", text: "Settings" }]}
    >
      {/* TEMPORARY (M0): remove in M2 */}
      <M0TestNotes />
    </PlaceholderScreen>
  );
}
