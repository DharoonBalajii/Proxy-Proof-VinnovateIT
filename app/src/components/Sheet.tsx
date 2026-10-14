import { type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, space } from '../theme/tokens';
import { Icon } from './Icon';
import { T } from './ui';

export function Sheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space.xl) }]}>
            <View style={styles.grab} />
            <View style={styles.head}>
              <T variant="h2" style={{ flex: 1 }}>{title}</T>
              <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={12} style={styles.close}>
                <Icon name="x" size={18} color={colors.inkSoft} />
              </Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 560 }} contentContainerStyle={{ gap: space.lg }}>
              {children}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(12,16,48,0.45)' },
  sheet: { backgroundColor: colors.chalk, borderTopLeftRadius: radius.lg + 4, borderTopRightRadius: radius.lg + 4, paddingHorizontal: space.xl, paddingTop: space.md, gap: space.lg },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.haze },
  head: { flexDirection: 'row', alignItems: 'center' },
  close: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.hazeSoft, alignItems: 'center', justifyContent: 'center' },
});
