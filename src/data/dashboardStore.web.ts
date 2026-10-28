import { EMPTY_STORE, parseStore, type DashboardStore } from '../core/dashboard';

export async function loadDashboardStore(): Promise<DashboardStore> { return parseStore(localStorage.getItem('stillwave-dashboard-v1')) ?? { ...EMPTY_STORE }; }
export async function saveDashboardStore(value: DashboardStore): Promise<void> { localStorage.setItem('stillwave-dashboard-v1', JSON.stringify(value)); }
