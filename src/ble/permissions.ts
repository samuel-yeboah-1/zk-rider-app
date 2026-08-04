import { PermissionsAndroid, Platform } from 'react-native';

export interface PermissionResult {
  granted: boolean;
  missing: string[];
}

export async function ensureBlePermissions(): Promise<PermissionResult> {
  if (Platform.OS !== 'android') {
    return { granted: true, missing: [] };
  }

  const apiLevel = typeof Platform.Version === 'number' ? Platform.Version : parseInt(Platform.Version, 10);

  const perms: string[] =
    apiLevel >= 31
      ? [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];

  const result = await PermissionsAndroid.requestMultiple(perms as any);
  const missing = perms.filter(
    (p) => result[p as keyof typeof result] !== PermissionsAndroid.RESULTS.GRANTED
  );
  return { granted: missing.length === 0, missing };
}
