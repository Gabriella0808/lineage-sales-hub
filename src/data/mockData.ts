// Types
export interface Manager {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatar?: string;
  region: string;
}

export interface SalesRep {
  id: string;
  name: string;
  email: string;
  phone: string;
  managerId: string;
  territories: string[];
  dealerCount: number;
  status: 'active' | 'inactive' | 'on-leave';
  kpiScore: number;
  quota: number;
  revenue: number;
  tasksCompleted: number;
  tasksPending: number;
  tasksOverdue: number;
  lastActivity: string;
  avatar?: string;
}

export interface Territory {
  id: string;
  name: string;
  region: string;
  state: string;
  assignedReps: string[];
  dealerCount: number;
  revenue: number;
  quota: number;
  kpiScore: number;
  status: 'on-track' | 'at-risk' | 'underperforming' | 'exceeding';
}

export interface Dealer {
  id: string;
  name: string;
  repId: string;
  territoryId: string;
  city: string;
  state: string;
  phone: string;
  email: string;
  website: string;
  status: 'active' | 'inactive' | 'prospect' | 'at-risk';
  engagement: 'high' | 'medium' | 'low';
  lastContact: string;
  revenue: number;
}

export interface Contact {
  id: string;
  name: string;
  company: string;
  role: 'dealer' | 'rep' | 'manager' | 'other';
  title: string;
  phone: string;
  cell: string;
  email: string;
  website: string;
  territory: string;
  assignedTo: string;
}

export interface Activity {
  id: string;
  type: 'call' | 'email' | 'meeting' | 'task' | 'alert';
  title: string;
  description: string;
  timestamp: string;
  relatedTo: string;
  relatedType: 'rep' | 'dealer' | 'territory';
}

export interface KpiRecord {
  repId: string;
  month: string;
  revenue: number;
  quota: number;
  dealerVisits: number;
  newDealers: number;
  tasksCompleted: number;
  conversionRate: number;
}

// Seed data
export const currentManager: Manager = {
  id: 'mgr-1',
  name: 'Will Harrington',
  email: 'will.harrington@lineagecollections.com',
  phone: '(404) 555-0190',
  region: 'Southeast',
};

export const salesReps: SalesRep[] = [
  { id: 'rep-1', name: 'Marcus Chen', email: 'marcus.chen@lineagecollections.com', phone: '(678) 555-0112', managerId: 'mgr-1', territories: ['ter-1', 'ter-2'], dealerCount: 14, status: 'active', kpiScore: 92, quota: 450000, revenue: 412000, tasksCompleted: 28, tasksPending: 4, tasksOverdue: 1, lastActivity: '2026-04-14', },
  { id: 'rep-2', name: 'Sarah Mitchell', email: 'sarah.mitchell@lineagecollections.com', phone: '(770) 555-0198', managerId: 'mgr-1', territories: ['ter-3'], dealerCount: 11, status: 'active', kpiScore: 87, quota: 380000, revenue: 331000, tasksCompleted: 22, tasksPending: 6, tasksOverdue: 3, lastActivity: '2026-04-15', },
  { id: 'rep-3', name: 'David Okafor', email: 'david.okafor@lineagecollections.com', phone: '(404) 555-0234', managerId: 'mgr-1', territories: ['ter-4', 'ter-5'], dealerCount: 18, status: 'active', kpiScore: 78, quota: 520000, revenue: 405000, tasksCompleted: 19, tasksPending: 8, tasksOverdue: 5, lastActivity: '2026-04-13', },
  { id: 'rep-4', name: 'Jessica Tran', email: 'jessica.tran@lineagecollections.com', phone: '(912) 555-0167', managerId: 'mgr-1', territories: ['ter-6'], dealerCount: 9, status: 'active', kpiScore: 95, quota: 300000, revenue: 298000, tasksCompleted: 31, tasksPending: 2, tasksOverdue: 0, lastActivity: '2026-04-15', },
  { id: 'rep-5', name: 'Ryan Brooks', email: 'ryan.brooks@lineagecollections.com', phone: '(843) 555-0145', managerId: 'mgr-1', territories: ['ter-7'], dealerCount: 7, status: 'on-leave', kpiScore: 64, quota: 280000, revenue: 178000, tasksCompleted: 12, tasksPending: 11, tasksOverdue: 7, lastActivity: '2026-04-01', },
  { id: 'rep-6', name: 'Amanda Cole', email: 'amanda.cole@lineagecollections.com', phone: '(706) 555-0189', managerId: 'mgr-1', territories: ['ter-2', 'ter-8'], dealerCount: 12, status: 'active', kpiScore: 83, quota: 410000, revenue: 340000, tasksCompleted: 25, tasksPending: 5, tasksOverdue: 2, lastActivity: '2026-04-14', },
];

export const territories: Territory[] = [
  { id: 'ter-1', name: 'Metro Atlanta', region: 'Georgia', state: 'GA', assignedReps: ['rep-1'], dealerCount: 8, revenue: 245000, quota: 260000, kpiScore: 88, status: 'on-track' },
  { id: 'ter-2', name: 'North Georgia', region: 'Georgia', state: 'GA', assignedReps: ['rep-1', 'rep-6'], dealerCount: 10, revenue: 198000, quota: 220000, kpiScore: 82, status: 'on-track' },
  { id: 'ter-3', name: 'Coastal Carolina', region: 'Carolinas', state: 'SC', assignedReps: ['rep-2'], dealerCount: 11, revenue: 331000, quota: 380000, kpiScore: 87, status: 'on-track' },
  { id: 'ter-4', name: 'Charlotte Metro', region: 'Carolinas', state: 'NC', assignedReps: ['rep-3'], dealerCount: 9, revenue: 210000, quota: 270000, kpiScore: 72, status: 'at-risk' },
  { id: 'ter-5', name: 'Raleigh-Durham', region: 'Carolinas', state: 'NC', assignedReps: ['rep-3'], dealerCount: 9, revenue: 195000, quota: 250000, kpiScore: 74, status: 'at-risk' },
  { id: 'ter-6', name: 'Savannah', region: 'Georgia', state: 'GA', assignedReps: ['rep-4'], dealerCount: 9, revenue: 298000, quota: 300000, kpiScore: 95, status: 'exceeding' },
  { id: 'ter-7', name: 'Low Country SC', region: 'Carolinas', state: 'SC', assignedReps: ['rep-5'], dealerCount: 7, revenue: 178000, quota: 280000, kpiScore: 64, status: 'underperforming' },
  { id: 'ter-8', name: 'Augusta', region: 'Georgia', state: 'GA', assignedReps: ['rep-6'], dealerCount: 6, revenue: 142000, quota: 190000, kpiScore: 75, status: 'at-risk' },
];

export const dealers: Dealer[] = [
  { id: 'dlr-1', name: 'Peachtree Furnishings', repId: 'rep-1', territoryId: 'ter-1', city: 'Atlanta', state: 'GA', phone: '(404) 555-1001', email: 'info@peachtreefurn.com', website: 'peachtreefurnishings.com', status: 'active', engagement: 'high', lastContact: '2026-04-12', revenue: 85000 },
  { id: 'dlr-2', name: 'Southern Comfort Home', repId: 'rep-1', territoryId: 'ter-1', city: 'Decatur', state: 'GA', phone: '(404) 555-1002', email: 'sales@southerncomfort.com', website: 'southerncomforthome.com', status: 'active', engagement: 'medium', lastContact: '2026-04-08', revenue: 62000 },
  { id: 'dlr-3', name: 'Buckhead Interiors', repId: 'rep-1', territoryId: 'ter-1', city: 'Atlanta', state: 'GA', phone: '(404) 555-1003', email: 'contact@buckheadinteriors.com', website: 'buckheadinteriors.com', status: 'active', engagement: 'high', lastContact: '2026-04-14', revenue: 98000 },
  { id: 'dlr-4', name: 'Mountain View Design', repId: 'rep-1', territoryId: 'ter-2', city: 'Dahlonega', state: 'GA', phone: '(706) 555-1004', email: 'info@mtviewdesign.com', website: 'mountainviewdesign.com', status: 'active', engagement: 'low', lastContact: '2026-03-28', revenue: 31000 },
  { id: 'dlr-5', name: 'Palmetto Home Gallery', repId: 'rep-2', territoryId: 'ter-3', city: 'Charleston', state: 'SC', phone: '(843) 555-1005', email: 'info@palmettohome.com', website: 'palmettohomegallery.com', status: 'active', engagement: 'high', lastContact: '2026-04-15', revenue: 112000 },
  { id: 'dlr-6', name: 'Coastal Living Furniture', repId: 'rep-2', territoryId: 'ter-3', city: 'Myrtle Beach', state: 'SC', phone: '(843) 555-1006', email: 'sales@coastalliving.com', website: 'coastallivingfurn.com', status: 'active', engagement: 'medium', lastContact: '2026-04-10', revenue: 74000 },
  { id: 'dlr-7', name: 'Queen City Showroom', repId: 'rep-3', territoryId: 'ter-4', city: 'Charlotte', state: 'NC', phone: '(704) 555-1007', email: 'info@qcshowroom.com', website: 'queencityshowroom.com', status: 'at-risk', engagement: 'low', lastContact: '2026-03-15', revenue: 28000 },
  { id: 'dlr-8', name: 'Triangle Home Design', repId: 'rep-3', territoryId: 'ter-5', city: 'Raleigh', state: 'NC', phone: '(919) 555-1008', email: 'info@trianglehome.com', website: 'trianglehomedesign.com', status: 'active', engagement: 'medium', lastContact: '2026-04-05', revenue: 56000 },
  { id: 'dlr-9', name: 'Savannah Style House', repId: 'rep-4', territoryId: 'ter-6', city: 'Savannah', state: 'GA', phone: '(912) 555-1009', email: 'hello@savannahstyle.com', website: 'savannahstylehouse.com', status: 'active', engagement: 'high', lastContact: '2026-04-15', revenue: 134000 },
  { id: 'dlr-10', name: 'Heritage Furnishings', repId: 'rep-4', territoryId: 'ter-6', city: 'Pooler', state: 'GA', phone: '(912) 555-1010', email: 'info@heritagefurn.com', website: 'heritagefurnishings.com', status: 'active', engagement: 'high', lastContact: '2026-04-13', revenue: 89000 },
  { id: 'dlr-11', name: 'Hilton Head Living', repId: 'rep-5', territoryId: 'ter-7', city: 'Hilton Head', state: 'SC', phone: '(843) 555-1011', email: 'info@hhiliving.com', website: 'hiltonheadliving.com', status: 'active', engagement: 'low', lastContact: '2026-03-20', revenue: 42000 },
  { id: 'dlr-12', name: 'Augusta Home & Design', repId: 'rep-6', territoryId: 'ter-8', city: 'Augusta', state: 'GA', phone: '(706) 555-1012', email: 'info@augustahome.com', website: 'augustahomedesign.com', status: 'prospect', engagement: 'medium', lastContact: '2026-04-11', revenue: 18000 },
];

export const contacts: Contact[] = [
  ...salesReps.map(r => ({ id: `c-${r.id}`, name: r.name, company: 'Lineage Collections', role: 'rep' as const, title: 'Sales Representative', phone: r.phone, cell: r.phone, email: r.email, website: 'lineagecollections.com', territory: territories.filter(t => r.territories.includes(t.id)).map(t => t.name).join(', '), assignedTo: currentManager.name })),
  { id: 'c-mgr-1', name: currentManager.name, company: 'Lineage Collections', role: 'manager', title: 'Regional Sales Manager', phone: currentManager.phone, cell: '(404) 555-0191', email: currentManager.email, website: 'lineagecollections.com', territory: 'Southeast', assignedTo: '' },
  ...dealers.map(d => ({ id: `c-${d.id}`, name: d.name, company: d.name, role: 'dealer' as const, title: 'Dealer', phone: d.phone, cell: '', email: d.email, website: d.website, territory: territories.find(t => t.id === d.territoryId)?.name || '', assignedTo: salesReps.find(r => r.id === d.repId)?.name || '' })),
];

export const activities: Activity[] = [
  { id: 'act-1', type: 'meeting', title: 'Quarterly review with Buckhead Interiors', description: 'Reviewed Q1 performance and discussed Q2 targets', timestamp: '2026-04-14T14:30:00', relatedTo: 'Buckhead Interiors', relatedType: 'dealer' },
  { id: 'act-2', type: 'alert', title: 'Queen City Showroom engagement dropped', description: 'No contact in 30+ days, engagement flagged low', timestamp: '2026-04-14T09:00:00', relatedTo: 'Queen City Showroom', relatedType: 'dealer' },
  { id: 'act-3', type: 'call', title: 'Marcus Chen check-in call', description: 'Discussed Metro Atlanta pipeline and North GA expansion', timestamp: '2026-04-13T16:00:00', relatedTo: 'Marcus Chen', relatedType: 'rep' },
  { id: 'act-4', type: 'task', title: 'Ryan Brooks overdue tasks escalated', description: '7 overdue tasks flagged for follow-up', timestamp: '2026-04-13T10:00:00', relatedTo: 'Ryan Brooks', relatedType: 'rep' },
  { id: 'act-5', type: 'email', title: 'Jessica Tran hit 99% quota', description: 'On track to exceed Q2 target in Savannah territory', timestamp: '2026-04-12T11:00:00', relatedTo: 'Jessica Tran', relatedType: 'rep' },
  { id: 'act-6', type: 'meeting', title: 'Territory review: Charlotte Metro', description: 'David Okafor presented recovery plan for underperforming dealers', timestamp: '2026-04-11T13:00:00', relatedTo: 'Charlotte Metro', relatedType: 'territory' },
  { id: 'act-7', type: 'alert', title: 'Low Country SC needs attention', description: 'Territory KPI dropped below 65, Ryan Brooks on leave', timestamp: '2026-04-10T08:00:00', relatedTo: 'Low Country SC', relatedType: 'territory' },
  { id: 'act-8', type: 'call', title: 'New dealer prospect in Augusta', description: 'Amanda Cole identified new prospect, Augusta Home & Design', timestamp: '2026-04-09T15:30:00', relatedTo: 'Amanda Cole', relatedType: 'rep' },
];

export const monthlyKpi: KpiRecord[] = [
  { repId: 'rep-1', month: 'Jan', revenue: 62000, quota: 75000, dealerVisits: 18, newDealers: 1, tasksCompleted: 8, conversionRate: 0.34 },
  { repId: 'rep-1', month: 'Feb', revenue: 71000, quota: 75000, dealerVisits: 22, newDealers: 0, tasksCompleted: 7, conversionRate: 0.38 },
  { repId: 'rep-1', month: 'Mar', revenue: 89000, quota: 75000, dealerVisits: 20, newDealers: 2, tasksCompleted: 6, conversionRate: 0.42 },
  { repId: 'rep-1', month: 'Apr', revenue: 95000, quota: 75000, dealerVisits: 24, newDealers: 1, tasksCompleted: 7, conversionRate: 0.44 },
  { repId: 'rep-2', month: 'Jan', revenue: 55000, quota: 63000, dealerVisits: 15, newDealers: 0, tasksCompleted: 6, conversionRate: 0.30 },
  { repId: 'rep-2', month: 'Feb', revenue: 68000, quota: 63000, dealerVisits: 17, newDealers: 1, tasksCompleted: 5, conversionRate: 0.35 },
  { repId: 'rep-2', month: 'Mar', revenue: 82000, quota: 63000, dealerVisits: 19, newDealers: 0, tasksCompleted: 6, conversionRate: 0.40 },
  { repId: 'rep-2', month: 'Apr', revenue: 76000, quota: 63000, dealerVisits: 16, newDealers: 1, tasksCompleted: 5, conversionRate: 0.37 },
  { repId: 'rep-3', month: 'Jan', revenue: 72000, quota: 87000, dealerVisits: 14, newDealers: 0, tasksCompleted: 4, conversionRate: 0.25 },
  { repId: 'rep-3', month: 'Feb', revenue: 78000, quota: 87000, dealerVisits: 12, newDealers: 0, tasksCompleted: 5, conversionRate: 0.28 },
  { repId: 'rep-3', month: 'Mar', revenue: 95000, quota: 87000, dealerVisits: 16, newDealers: 1, tasksCompleted: 5, conversionRate: 0.31 },
  { repId: 'rep-3', month: 'Apr', revenue: 88000, quota: 87000, dealerVisits: 15, newDealers: 0, tasksCompleted: 5, conversionRate: 0.29 },
  { repId: 'rep-4', month: 'Jan', revenue: 58000, quota: 50000, dealerVisits: 20, newDealers: 1, tasksCompleted: 9, conversionRate: 0.48 },
  { repId: 'rep-4', month: 'Feb', revenue: 65000, quota: 50000, dealerVisits: 22, newDealers: 0, tasksCompleted: 8, conversionRate: 0.52 },
  { repId: 'rep-4', month: 'Mar', revenue: 79000, quota: 50000, dealerVisits: 24, newDealers: 1, tasksCompleted: 7, conversionRate: 0.50 },
  { repId: 'rep-4', month: 'Apr', revenue: 82000, quota: 50000, dealerVisits: 21, newDealers: 0, tasksCompleted: 7, conversionRate: 0.55 },
  { repId: 'rep-5', month: 'Jan', revenue: 45000, quota: 47000, dealerVisits: 10, newDealers: 0, tasksCompleted: 3, conversionRate: 0.20 },
  { repId: 'rep-5', month: 'Feb', revenue: 42000, quota: 47000, dealerVisits: 8, newDealers: 0, tasksCompleted: 4, conversionRate: 0.18 },
  { repId: 'rep-5', month: 'Mar', revenue: 48000, quota: 47000, dealerVisits: 9, newDealers: 0, tasksCompleted: 3, conversionRate: 0.22 },
  { repId: 'rep-5', month: 'Apr', revenue: 35000, quota: 47000, dealerVisits: 5, newDealers: 0, tasksCompleted: 2, conversionRate: 0.15 },
  { repId: 'rep-6', month: 'Jan', revenue: 60000, quota: 68000, dealerVisits: 16, newDealers: 0, tasksCompleted: 6, conversionRate: 0.32 },
  { repId: 'rep-6', month: 'Feb', revenue: 72000, quota: 68000, dealerVisits: 18, newDealers: 1, tasksCompleted: 7, conversionRate: 0.36 },
  { repId: 'rep-6', month: 'Mar', revenue: 85000, quota: 68000, dealerVisits: 20, newDealers: 0, tasksCompleted: 6, conversionRate: 0.39 },
  { repId: 'rep-6', month: 'Apr', revenue: 78000, quota: 68000, dealerVisits: 17, newDealers: 1, tasksCompleted: 6, conversionRate: 0.35 },
];

// Helpers
export const getRepName = (id: string) => salesReps.find(r => r.id === id)?.name || 'Unknown';
export const getTerritoryName = (id: string) => territories.find(t => t.id === id)?.name || 'Unknown';
export const getRepsByTerritory = (terId: string) => salesReps.filter(r => r.territories.includes(terId));
export const getDealersByRep = (repId: string) => dealers.filter(d => d.repId === repId);
export const getDealersByTerritory = (terId: string) => dealers.filter(d => d.territoryId === terId);

export const formatCurrency = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);
export const formatPercent = (n: number) => `${Math.round(n * 100)}%`;
