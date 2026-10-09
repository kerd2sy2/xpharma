import React, { useEffect } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { setActiveSubscriptionPlan, getSubscriptionStatus } from '@/features/subscription';
import { useAuth } from '@/context/AuthContext';

export default function SubscriptionSuccessScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    paymentStatus?: string;
    merchantOrderId?: string;
    orderId?: string;
    amount?: string;
    orderReference?: string;
  }>();

  useEffect(() => {
    const rawStatus = (params.paymentStatus || '').toUpperCase();
    if (
      rawStatus === 'FAILED' ||
      rawStatus === 'REJECTED' ||
      rawStatus === 'CANCELLED' ||
      rawStatus === 'DECLINED'
    ) {
      router.replace('/');
      return;
    }

    let detectedPlan = 0;
    const rawOrder = params.merchantOrderId || params.orderId || params.orderReference || '';
    if (rawOrder) {
      const matchP = rawOrder.match(/-P(\d+)-/);
      if (matchP && matchP[1]) {
        detectedPlan = parseInt(matchP[1], 10);
      }
    }

    const syncStatusAndRedirect = async () => {
      try {
        if (detectedPlan > 0) {
          await setActiveSubscriptionPlan(detectedPlan).catch(() => {});
        }
        if (user?.email) {
          await getSubscriptionStatus(user.email).catch(() => {});
        }
      } catch (e) {
        console.warn('Subscription redirect sync error:', e);
      } finally {
        router.replace('/');
      }
    };

    syncStatusAndRedirect();
  }, [params, router, user]);

  return <View style={{ flex: 1, backgroundColor: '#F8FAFC' }} />;
}
