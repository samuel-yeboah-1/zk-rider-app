import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, PanResponder, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { theme } from '../theme';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

export function SlideAction({
  label,
  busyLabel,
  icon,
  color = theme.colors.primary,
  onComplete,
  busy,
}: {
  label: string;
  busyLabel?: string;
  icon: IconName;
  color?: string;
  onComplete: () => void;
  busy?: boolean;
}) {
  const KNOB = 58;
  const x = useRef(new Animated.Value(0)).current;
  const maxXRef = useRef(0);
  const busyRef = useRef(false);
  const done = useRef(false);
  const [maxX, setMaxX] = useState(0);

  useEffect(() => {
    busyRef.current = !!busy;
    if (!busy && done.current) {
      done.current = false;
      Animated.spring(x, { toValue: 0, useNativeDriver: true }).start();
    }
  }, [busy, x]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !busyRef.current && !done.current,
      onMoveShouldSetPanResponder: () => !busyRef.current && !done.current,
      onPanResponderMove: (_e, g) => {
        x.setValue(Math.min(maxXRef.current, Math.max(0, g.dx)));
      },
      onPanResponderRelease: (_e, g) => {
        const max = maxXRef.current;
        const nx = Math.min(max, Math.max(0, g.dx));
        if (max > 0 && nx >= max * 0.85) {
          done.current = true;
          Animated.timing(x, { toValue: max, duration: 120, useNativeDriver: true }).start(() => onComplete());
        } else {
          Animated.spring(x, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  const labelOpacity = x.interpolate({ inputRange: [0, Math.max(1, maxX)], outputRange: [1, 0], extrapolate: 'clamp' });

  return (
    <View
      style={[styles.track, { borderColor: color }]}
      onLayout={(e) => {
        const m = Math.max(0, e.nativeEvent.layout.width - KNOB);
        maxXRef.current = m;
        setMaxX(m);
      }}
    >
      <Animated.Text style={[styles.label, { color, opacity: labelOpacity }]}>
        {busy ? busyLabel ?? 'Working…' : label}
      </Animated.Text>
      <Animated.View style={[styles.knob, { backgroundColor: color, transform: [{ translateX: x }] }]} {...pan.panHandlers}>
        {busy ? (
          <ActivityIndicator color={theme.colors.primaryText} />
        ) : (
          <MaterialCommunityIcons name={icon} size={22} color={theme.colors.primaryText} />
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 58,
    borderRadius: 29,
    borderWidth: 1.5,
    backgroundColor: 'rgba(255,255,255,0.04)',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  label: { position: 'absolute', left: 0, right: 0, textAlign: 'center', fontSize: 14, fontWeight: '800', letterSpacing: 1 },
  knob: { position: 'absolute', left: 0, top: 0, width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
});
