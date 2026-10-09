import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import { HARDWARE_DEVICE_ID_KEY } from './constants';

/**
 * Computes a permanent, deterministic hardware signature for this physical device.
 * Combines native hardware chip properties that never change across app reinstalls or updates:
 * - Brand, Manufacturer
 * - Model Name / Model ID
 * - Product & Design Codename
 * - Physical RAM (total memory)
 * - Supported CPU Architectures
 */
export function computeHardwareFingerprint(): string {
  try {
    const brand = (Device.brand || '').trim();
    const model = (Device.modelName || (Device as any).modelId || Device.deviceName || '').trim();
    const manufacturer = (Device.manufacturer || '').trim();
    const design = (Device.designName || '').trim();
    const product = (Device.productName || '').trim();
    const memory = Device.totalMemory ? String(Device.totalMemory) : '';
    const cpus = (Device.supportedCpuArchitectures || []).join(',');

    // Combine into a stable raw hardware payload
    const rawData = [
      Platform.OS,
      brand,
      manufacturer,
      model,
      design,
      product,
      memory,
      cpus,
    ].join(':::').toLowerCase().replace(/\s+/g, '');

    // Fast deterministic 64-bit hashing (two 32-bit FNV-1a mixing passes)
    let h1 = 0x811c9dc5;
    let h2 = 0x5a7c3b19;
    for (let i = 0; i < rawData.length; i++) {
      const code = rawData.charCodeAt(i);
      h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0;
      h2 = Math.imul(h2 ^ ((code << 5) | (code >>> 27)), 0x5bd1e995) >>> 0;
    }

    const hex1 = h1.toString(16).padStart(8, '0');
    const hex2 = h2.toString(16).padStart(8, '0');

    const cleanBrand = brand.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) || Platform.OS.toUpperCase();
    const cleanModel = model.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'DEV';

    return `XPH-HW-${cleanBrand}-${cleanModel}-${hex1}${hex2}`;
  } catch (e) {
    return `XPH-HW-${Platform.OS.toUpperCase()}-FALLBACK`;
  }
}

/**
 * Get or create a permanent unique hardware serial / identifier for this physical phone
 */
export async function getUniqueDeviceId(): Promise<{ deviceId: string; deviceName: string }> {
  try {
    const brand = Device.brand ? Device.brand.trim() : '';
    const model = Device.modelName ? Device.modelName.trim() : (Device.deviceName || '');
    let deviceName = `${brand} ${model}`.trim();
    if (!deviceName) {
      deviceName = Platform.OS === 'ios' ? 'هاتف iPhone' : (Platform.OS === 'android' ? 'هاتف Android' : 'متصفح');
    }

    const hardwareId = computeHardwareFingerprint();

    let deviceId = await SecureStore.getItemAsync(HARDWARE_DEVICE_ID_KEY);
    if (!deviceId || !deviceId.startsWith('XPH-HW-')) {
      deviceId = hardwareId;
      await SecureStore.setItemAsync(HARDWARE_DEVICE_ID_KEY, deviceId);
    }

    return { deviceId, deviceName };
  } catch (e) {
    const fallbackId = computeHardwareFingerprint();
    return {
      deviceId: fallbackId,
      deviceName: Platform.OS === 'ios' ? 'هاتف iPhone' : 'هاتف Android',
    };
  }
}

export const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
  (Constants as any).appOwnership === 'expo';
