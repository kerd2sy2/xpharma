import { useState } from 'react';
import * as Updates from 'expo-updates';
import { UpdateModalStatus } from '@/components/UpdateModal';

export function useOTAUpdates() {
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalStatus, setModalStatus] = useState<UpdateModalStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

  const checkForUpdates = async () => {
    if (__DEV__) {
      setModalStatus('dev_mode');
      setModalVisible(true);
      return;
    }

    setCheckingUpdate(true);
    setModalStatus('checking');
    setModalVisible(true);
    setErrorMessage(undefined);

    try {
      const update = await Updates.checkForUpdateAsync();
      if (update.isAvailable) {
        setModalStatus('available');
      } else {
        setModalStatus('up_to_date');
      }
    } catch (error: any) {
      setModalStatus('error');
      setErrorMessage(
        error?.message
          ? `تعذر فحص التحديثات حالياً: ${error.message}`
          : 'التطبيق يعمل بآخر ملفات، أو تعذر الاتصال بمركز التحديثات حالياً.'
      );
    } finally {
      setCheckingUpdate(false);
    }
  };

  const downloadUpdate = async () => {
    try {
      setCheckingUpdate(true);
      setModalStatus('downloading');
      await Updates.fetchUpdateAsync();
      setModalStatus('ready');
    } catch (e: any) {
      setModalStatus('error');
      setErrorMessage(
        e?.message
          ? `تعذر استكمال تنزيل التحديث: ${e.message}`
          : 'يرجى التحقق من الاتصال بالإنترنت والمحاولة لاحقاً.'
      );
    } finally {
      setCheckingUpdate(false);
    }
  };

  const restartApp = async () => {
    try {
      await Updates.reloadAsync();
    } catch {
      setModalVisible(false);
    }
  };

  const closeUpdateModal = () => {
    if (modalStatus !== 'downloading' && modalStatus !== 'checking') {
      setModalVisible(false);
      setModalStatus('idle');
      setErrorMessage(undefined);
    }
  };

  return {
    checkingUpdate,
    modalVisible,
    modalStatus,
    errorMessage,
    checkForUpdates,
    downloadUpdate,
    restartApp,
    closeUpdateModal,
  };
}
