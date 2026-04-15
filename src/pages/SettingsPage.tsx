import { currentManager } from "@/data/mockData";
import { Settings as SettingsIcon } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="animate-fade-in max-w-2xl">
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Manage your portal preferences</p>
      </div>

      <div className="glass-card p-6 mb-5">
        <h3 className="text-sm font-semibold mb-4">Profile</h3>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between py-2 border-b"><span className="text-muted-foreground">Name</span><span className="font-medium">{currentManager.name}</span></div>
          <div className="flex justify-between py-2 border-b"><span className="text-muted-foreground">Email</span><span className="font-medium">{currentManager.email}</span></div>
          <div className="flex justify-between py-2 border-b"><span className="text-muted-foreground">Phone</span><span className="font-medium">{currentManager.phone}</span></div>
          <div className="flex justify-between py-2"><span className="text-muted-foreground">Region</span><span className="font-medium">{currentManager.region}</span></div>
        </div>
      </div>

      <div className="glass-card p-6 mb-5">
        <h3 className="text-sm font-semibold mb-4">Data Integration</h3>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between items-center py-2 border-b">
            <span className="text-muted-foreground">Acctivate SQL Server</span>
            <span className="text-xs bg-success/10 text-success px-2.5 py-0.5 rounded-full font-medium">Connected</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b">
            <span className="text-muted-foreground">Last Sync</span>
            <span className="font-medium">Today, 8:00 AM</span>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="text-muted-foreground">Sync Frequency</span>
            <span className="font-medium">Every 4 hours</span>
          </div>
        </div>
      </div>

      <div className="glass-card p-6">
        <h3 className="text-sm font-semibold mb-4">Notifications</h3>
        <p className="text-sm text-muted-foreground">Notification preferences will be configurable here in a future update.</p>
      </div>
    </div>
  );
}
