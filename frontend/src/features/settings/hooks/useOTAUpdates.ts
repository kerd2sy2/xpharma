import { useState } from 'react';
import { Alert } from 'react-native';
import * as Updates from 'expo-updates';

export function useOTAUpdates() {
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  const checkForUpdates = async () => {
    if (__DEV__) {
      Alert.alert(
        'وضع التطوير المحلي',
        'أنت حالياً في وضع المطور المحلي (Development Mode). التحديثات الهوائية التلقائية تعمل على النسخ المثبتة (Preview / Production).'
      );
      return;
    }

    setCheckingUpdate(true);
    try {
      const update = await Updates.checkForUpdateAsync();
      if (update.isAvailable) {
        Alert.alert(
          'تحديث هوائي جديد متاح 🚀',
          'تم العثور على تحديث جديد للنظام يحتوي على تحسينات وإصلاحات. هل تريد تنزيل التحديث وإعادة تشغيل التطبيق فوراً؟',
          [
            { text: 'لاحقاً', style: 'cancel' },
            {
              text: 'تنزيل وتحديث الآن',
              onPress: async () => {
                try {
                  setCheckingUpdate(true);
                  await Updates.fetchUpdateAsync();
                  Alert.alert(
                    'تم التنزيل بنجاح ✅',
                    'تم تنزيل أحدث ملفات النظام. سيتم الآن إعادة تشغيل التطبيق لتطبيق التحديث.',
                    [
                      {
                        text: 'إعادة التشغيل الآن',
                        onPress: async () => {
                          await Updates.reloadAsync();
                        },
                      },
                    ]
                  );
                } catch (e: any) {
                  Alert.alert(
                    'تنبيه',
                    'تعذر استكمال تنزيل التحديث: ' +
                      (e?.message || 'يرجى التحقق من الاتصال بالإنترنت والمحاولة لاحقاً')
                  );
                } finally {
                  setCheckingUpdate(false);
                }
              },
            },
          ]
        );
      } else {
        Alert.alert('أحدث إصدار ✅', 'تطبيقك يعمل بالفعل بأحدث إصدار متاح، ولا توجد تحديثات جديدة.');
      }
    } catch (error: any) {
      Alert.alert(
        'فحص التحديثات الهوائية',
        'التطبيق يعمل بآخر ملفات، أو تعذر الاتصال بمركز التحديثات حالياً: ' + (error?.message || '')
      );
    } finally {
      setCheckingUpdate(false);
    }
  };

  return {
    checkingUpdate,
    checkForUpdates,
  };
}
