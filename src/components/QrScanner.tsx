import React, { useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

import { Button } from './ui';
import { theme } from '../theme';

export function extractImei(payload: string): string {
  const m = payload.match(/\d{14,16}/);
  return m ? m[0] : payload.trim();
}

export function QrScanner({
  visible,
  onClose,
  onScanned,
}: {
  visible: boolean;
  onClose: () => void;
  onScanned: (imei: string) => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [handled, setHandled] = useState(false);

  function handleBarcode({ data }: { data: string }) {
    if (handled) return;
    setHandled(true);
    onScanned(extractImei(data));
  }

  return (
    <Modal visible={visible} animationType="slide" onShow={() => setHandled(false)}>
      <View style={styles.container}>
        {!permission ? (
          <Centered text="Requesting camera…" />
        ) : !permission.granted ? (
          <Centered text="Camera permission is required to scan the scooter's QR code.">
            <Button label="Grant camera access" onPress={requestPermission} />
          </Centered>
        ) : (
          <>
            <CameraView
              style={StyleSheet.absoluteFill}
              barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'ean13'] }}
              onBarcodeScanned={handled ? undefined : handleBarcode}
            />
            <View style={styles.overlay} pointerEvents="none">
              <View style={styles.reticle} />
              <Text style={styles.hint}>Point at the code on the scooter</Text>
            </View>
          </>
        )}
        <View style={styles.footer}>
          <Button label="Cancel" variant="secondary" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

function Centered({ text, children }: { text: string; children?: React.ReactNode }) {
  return (
    <View style={styles.centered}>
      <Text style={styles.centeredText}>{text}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  reticle: {
    width: 240,
    height: 240,
    borderWidth: 3,
    borderColor: theme.colors.primary,
    borderRadius: theme.radius.lg,
  },
  hint: { color: '#fff', marginTop: 20, fontSize: 16, fontWeight: '600' },
  footer: { position: 'absolute', bottom: 40, left: 24, right: 24 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  centeredText: { color: '#fff', fontSize: 16, textAlign: 'center' },
});
