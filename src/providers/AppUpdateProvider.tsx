import { ReactNode } from 'react';

import { AppUpdateModal } from '../components/AppUpdateModal';
import { useAppUpdate } from '../hooks/useAppUpdate';

export function AppUpdateProvider({ children }: { children: ReactNode }) {
  const { updateState, openStore, dismissOptional } = useAppUpdate();

  return (
    <>
      {children}
      <AppUpdateModal state={updateState} onUpdate={openStore} onDismiss={dismissOptional} />
    </>
  );
}
