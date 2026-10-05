import { useRouter } from "expo-router";
import {
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  ViewStyle,
} from "react-native";

type BackButtonProps = {
  style?: StyleProp<ViewStyle>;
};

export default function BackButton({ style }: BackButtonProps) {
  const router = useRouter();

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel="Go back"
      onPress={() => router.back()}
      style={[styles.button, style]}
      hitSlop={8}
      activeOpacity={0.7}
    >
      <Text style={styles.chevron}>‹</Text>
      <Text style={styles.label}>Back</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    minHeight: 40,
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  chevron: {
    color: "#315743",
    fontSize: 30,
    lineHeight: 32,
    marginRight: 3,
    marginTop: -2,
  },
  label: {
    color: "#315743",
    fontSize: 14,
    fontWeight: "600",
  },
});
