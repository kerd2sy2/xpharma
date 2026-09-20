import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Animated,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { setActiveSubscriptionPlan, PRICING_PLANS, recordSubscriptionPayment } from '@/services/subscription';
import { useAuth } from '@/context/AuthContext';

export default function SubscriptionSuccessScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    paymentStatus?: string;
    merchantOrderId?: string;
    orderId?: string;
    amount?: string;
    transactionId?: string;
    orderReference?: string;
    cardBrand?: string;
    maskedCard?: string;
    currency?: string;
  }>();

  const [planPharmacies, setPlanPharmacies] = useState<number>(3);
  const [scaleAnim] = useState(new Animated.Value(0.7));
  const [fadeAnim] = useState(new Animated.Value(0));

  const isSuccess =
    !params.paymentStatus ||
    params.paymentStatus.toUpperCase() === 'SUCCESS' ||
    params.paymentStatus.toUpperCase() === 'CAPTURED';

  useEffect(() => {
    // 1. Determine plan from merchantOrderId or amount
    let detectedPlan = 3;
    if (params.merchantOrderId) {
      const match = params.merchantOrderId.match(/-P(\d+)-/);
      if (match && match[1]) {
        detectedPlan = parseInt(match[1], 10);
      }
    }
    if (!detectedPlan || detectedPlan <= 0) {
      const amt = parseInt(params.amount || '0', 10);
      const matched = PRICING_PLANS.find((p) => p.price === amt);
      if (matched) {
        detectedPlan = matched.pharmacies;
      }
    }

    setPlanPharmacies(detectedPlan);

    // 2. Activate subscription plan locally and persist
    if (isSuccess) {
      setActiveSubscriptionPlan(detectedPlan).catch(() => {});

      // 3. Record billing to central dashboard (admin.xpharma.cloud & api.xpharma.cloud)
      const amtVal = parseFloat(params.amount || '0') || (PRICING_PLANS.find((p) => p.pharmacies === detectedPlan)?.price ?? 200);
      recordSubscriptionPayment({
        user_email: user?.email || '',
        user_name: user?.name || 'دكتور صيدلي',
        user_phone: user?.phone || '',
        plan_type: `${detectedPlan} صيدليات`,
        amount: amtVal,
        payment_method: 'kashier',
        status: 'active',
        order_id: params.merchantOrderId || params.orderId || '',
        transaction_id: params.transactionId || '',
        card_brand: params.cardBrand || 'Visa',
        masked_card: params.maskedCard || '',
        receipt_ref: params.transactionId || params.orderReference || params.merchantOrderId || '',
        notes: `دفع إلكتروني ناجح عبر كاشير - بطاقة: ${params.maskedCard || 'فيزا/ماستر'} - كود العملية: ${params.transactionId || ''}`,
      }).catch((e) => console.warn('Record billing error:', e));
    }

    // 4. Entrance animation
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
  }, [params, isSuccess, fadeAnim, scaleAnim, user]);

  const handleGoHome = () => {
    router.replace('/');
  };

  const planObj = PRICING_PLANS.find((p) => p.pharmacies === planPharmacies);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />
      <View style={styles.container}>
        <Animated.View
          style={[
            styles.card,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          {isSuccess ? (
            <>
              <View style={styles.iconCircle}>
                <Ionicons name="checkmark-circle" size={80} color="#10B981" />
              </View>

              <Text style={styles.congratsBadge}>🎉 مبروك! تم الدفع بنجاح</Text>
              <Text style={styles.title}>تم تفعيل اشتراكك فوراً</Text>
              <Text style={styles.subtitle}>
                تمت معالجة عملية الدفع وتحديث حسابك لإدارة حتى{' '}
                <Text style={styles.highlightText}>
                  {planObj ? planObj.label : `${planPharmacies} صيدليات في كل مخزن`}
                </Text>{' '}
                مع إمكانية فتح كافة المخازن مجاناً وبلا حدود.
              </Text>

              <View style={styles.receiptBox}>
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptVal}>
                    {params.amount || (planObj ? planObj.price : 200)} جنيه مصري
                  </Text>
                  <Text style={styles.receiptLabel}>المبلغ المدفوع</Text>
                </View>

                {params.transactionId ? (
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptVal}>{params.transactionId}</Text>
                    <Text style={styles.receiptLabel}>رقم العملية</Text>
                  </View>
                ) : null}

                {params.orderReference ? (
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptVal}>{params.orderReference}</Text>
                    <Text style={styles.receiptLabel}>المرجع</Text>
                  </View>
                ) : null}

                {params.maskedCard ? (
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptVal}>{params.maskedCard}</Text>
                    <Text style={styles.receiptLabel}>البطاقة</Text>
                  </View>
                ) : null}
              </View>

              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={handleGoHome}
                activeOpacity={0.88}
              >
                <Text style={styles.primaryBtnText}>العودة للرئيسية والبدء الآن</Text>
                <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={[styles.iconCircle, { backgroundColor: '#FEE2E2' }]}>
                <MaterialCommunityIcons name="alert-circle" size={80} color="#EF4444" />
              </View>

              <Text style={[styles.title, { color: '#EF4444' }]}>لم تكتمل عملية الدفع</Text>
              <Text style={styles.subtitle}>
                حدث خطأ أثناء تنفيذ عملية الدفع عبر كاشير. يمكنك المحاولة مجدداً في أي وقت.
              </Text>

              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: '#4338CA' }]}
                onPress={handleGoHome}
                activeOpacity={0.88}
              >
                <Text style={styles.primaryBtnText}>الرجوع للتطبيق</Text>
              </TouchableOpacity>
            </>
          )}
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#1E293B',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 10,
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#D1FAE5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  congratsBadge: {
    fontSize: 14,
    fontWeight: '700',
    color: '#34D399',
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#F8FAFC',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  highlightText: {
    color: '#FBBF24',
    fontWeight: 'bold',
  },
  receiptBox: {
    width: '100%',
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  receiptLabel: {
    fontSize: 13,
    color: '#94A3B8',
  },
  receiptVal: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F1F5F9',
    fontFamily: 'monospace',
  },
  primaryBtn: {
    width: '100%',
    backgroundColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
