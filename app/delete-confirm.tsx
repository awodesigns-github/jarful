import { useState } from 'react';
import { useRouter, type Href } from 'expo-router';
import { AccountScreen, Body, Note, PillButton, errorCopy } from '@/components/account/Parts';
import { AuthFlowError, useDeleteAccount } from '@/lib/data';

export default function DeleteConfirm() {
  const router = useRouter();
  const deleteAccount = useDeleteAccount();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await deleteAccount();
      router.replace('/delete-done' as Href);
    } catch (e) {
      setMessage(e instanceof AuthFlowError && e.code === 'offline' ? 'Connect to the internet first. Nothing was deleted.' : errorCopy(e));
      setBusy(false);
    }
  };

  return (
    <AccountScreen
      testID="delete-confirm-screen"
      title="Delete everything?"
      actions={
        <>
          <PillButton testID="delete-cancel" kind="primary" label="Keep my notes" onPress={() => router.dismissTo('/settings' as Href)} disabled={busy} />
          <PillButton testID="delete-confirm" label="Yes, delete account and all notes" onPress={confirm} disabled={busy} />
        </>
      }
    >
      <Body>All of your notes will be removed for good. We cannot bring them back.</Body>
      {message && <Note testID="delete-message">{message}</Note>}
    </AccountScreen>
  );
}
