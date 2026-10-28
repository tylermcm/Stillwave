import { File, Paths } from 'expo-file-system';
import { EMPTY_STORE, parseStore, type DashboardStore } from '../core/dashboard';

// App-private storage: the chosen city, units and the last successful responses.
const store = () => new File(Paths.document, 'dashboard-v1.json');
export async function loadDashboardStore(): Promise<DashboardStore> {
  const file = store();
  return file.exists ? parseStore(await file.text()) : { ...EMPTY_STORE };
}
export async function saveDashboardStore(value: DashboardStore): Promise<void> {
  const temporary = new File(Paths.document, 'dashboard-v1.next.json');
  await temporary.write(JSON.stringify(value));
  await temporary.copy(store(), { overwrite: true });
  temporary.delete();
}
