import React from 'react';
import {
  FlatList,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  type ListRenderItemInfo,
} from 'react-native';
import type { OrbitSubscription } from './types';

interface Props {
  subscriptions: OrbitSubscription[];
  onItemPress?: (id: string) => void;
  activeId?: string;
}

interface ItemProps {
  sub: OrbitSubscription;
  isActive: boolean;
  onPress?: (id: string) => void;
}

function OrbitListItem({ sub, isActive, onPress }: ItemProps) {
  const priceText = (sub.monthlyCostMinor / 100).toFixed(2);
  const cadence = sub.billingCadence === 'ANNUAL' ? '/yr' : '/mo';

  return (
    <TouchableOpacity
      style={[styles.item, isActive && styles.itemActive]}
      onPress={() => onPress?.(sub.id)}
      accessibilityRole="link"
      accessibilityLabel={`${sub.name}, ${sub.ownerType.toLowerCase()}, ${priceText}${cadence}`}
    >
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{sub.category}</Text>
      </View>
      <Text style={styles.name}>{sub.name}</Text>
      <Text style={styles.price}>
        {priceText}
        {cadence}
      </Text>
    </TouchableOpacity>
  );
}

export function OrbitListFallback({ subscriptions, onItemPress, activeId }: Props) {
  const renderItem = ({ item }: ListRenderItemInfo<OrbitSubscription>) => (
    <OrbitListItem
      sub={item}
      isActive={item.id === activeId}
      {...(onItemPress === undefined ? {} : { onPress: onItemPress })}
    />
  );

  return (
    <View
      accessibilityRole="none"
      accessibilityLabel="Subscriptions as list"
      style={styles.container}
    >
      <FlatList
        data={subscriptions}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        accessibilityRole="list"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    gap: 8,
  },
  itemActive: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  badgeText: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.7)',
    textTransform: 'lowercase',
  },
  name: {
    flex: 1,
    fontSize: 15,
    color: '#fff',
  },
  price: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
  },
});
