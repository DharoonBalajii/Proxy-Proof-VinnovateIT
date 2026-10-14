import { View } from 'react-native';
import { colors } from '../theme/tokens';

// The gate in _layout redirects to login or the role's tabs once the session is restored.
export default function Index() {
  return <View style={{ flex: 1, backgroundColor: colors.chalk }} />;
}
