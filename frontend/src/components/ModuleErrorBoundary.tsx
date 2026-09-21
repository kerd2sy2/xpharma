import React, { Component, ErrorInfo, ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
  onRetry?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * ModuleErrorBoundary
 * عازل أخطاء موديولي: يحمي التطبيق من الانهيار في حال حدوث خطأ غير متوقع
 * داخل أي مكون أو موديول، ويعرض كرت استعادة هادئ بدلاً من الشاشة البيضاء.
 */
export default class ModuleErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ModuleErrorBoundary caught an error in submodule:', error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onRetry) {
      this.props.onRetry();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorCard}>
          <View style={styles.iconBox}>
            <Ionicons name="warning-outline" size={24} color="#DC2626" />
          </View>
          <View style={styles.textCol}>
            <Text style={styles.title}>
              {this.props.fallbackTitle || 'تعذر تحميل هذا القسم'}
            </Text>
            <Text style={styles.message} numberOfLines={2}>
              {this.props.fallbackMessage || 'حدث خطأ مؤقت في معالجة بيانات هذا الموديول. تم عزل المشكلة للحفاظ على عمل باقي التطبيق.'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={this.handleRetry}
            activeOpacity={0.7}
          >
            <Ionicons name="reload-outline" size={14} color="#FFFFFF" />
            <Text style={styles.retryBtnText}>إعادة المحاولة</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  errorCard: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginVertical: 8,
    marginHorizontal: 4,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 2,
  },
  title: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#991B1B',
    textAlign: 'right',
  },
  message: {
    fontSize: 11,
    fontWeight: '500',
    color: '#B91C1C',
    textAlign: 'right',
    lineHeight: 16,
  },
  retryBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DC2626',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
});
