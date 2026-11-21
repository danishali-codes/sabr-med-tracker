import Ionicons from '@expo/vector-icons/Ionicons';
import { View } from 'react-native';
import { checkKind } from '../domain/checks';
import { machineKind } from '../domain/machines';
import type { Medication } from '../domain/types';
import { useTheme } from '../theme';
import { lookOf, PillArt } from './PillArt';

/**
 * The med's pill (or bottle, pen...) drawn in its own shape and colours, on a rounded square tinted
 * with its accent colour. A machine (CPAP...) shows its icon instead.
 */
export function MedIcon({ med, size = 48 }: { med: Pick<Medication, 'form' | 'shape' | 'pillColor' | 'pillColor2' | 'color'> & Partial<Pick<Medication, 'machine' | 'check'>>; size?: number }) {
  const c = useTheme();
  const look = lookOf(med);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.32,
        backgroundColor: med.color + (c.dark ? '2E' : '1C'),
        borderWidth: c.dark ? 1 : 0,
        borderColor: med.color + '40',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {med.check ? (
        <Ionicons name={checkKind(med.check.type).icon} size={size * 0.5} color={med.color} />
      ) : med.machine ? <Ionicons name={machineKind(med.machine.type).icon} size={size * 0.5} color={med.color} /> : <PillArt {...look} size={size * 0.72} />}
    </View>
  );
}
