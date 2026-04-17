import { useState } from "react";
import { Mail, Phone, ExternalLink, Copy, MapPin } from "lucide-react";

// Billing addresses sourced from Reps-ship_to_address spreadsheet, keyed by email
const REP_ADDRESSES: Record<string, string> = {
  "mjdurh@gmail.com": "2635 SE 30th Place, Ocala, FL 34471",
  "bradrobertsonva@gmail.com": "3801 Manton Lane, Lynchburg, VA 24503",
  "bbq1994@gmail.com": "2979 Heritage Oaks Cir, Dacula, GA 30019",
  "sprdave2@aol.com": "730 Main St Ste 132, North Myrtle Beach, SC 29582",
  "scamillo1@aol.com": "28 Strathmore Lane, Madison, CT 06443",
  "jordanshindell@gmail.com": "201 Olympic Club Court, Blue Bell, PA 19422",
  "joshua.s.jastal@gmail.com": "3634 Hazelhurst Ave, Toledo, OH 43612",
  "peteravella@aol.com": "4 Jayne Ave, Melville, NY 11747",
  "huntsalesrep@gmail.com": "5901 Down Valley Ct, Austin, TX 78731",
  "fryer_gary@yahoo.com": "1667 Hwy 24, Hattieville, AR 72063",
  "stephenbusk@cs.com": "30798 Rocking Horse Lane, Niles, MI 49120",
  "bhholbrook@gmail.com": "18355 Fairmont Dr, Naples, FL 34114",
  "kerryschut1@gmail.com": "4611 Thornbird Dr, Middleville, MI 49333",
};
import { FilterBar } from "@/components/FilterBar";
import { useSalesReps, useTerritories, useDealers, useContacts } from "@/hooks/usePortalData";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

export default function DirectoryPage() {
  const { data: reps = [] } = useSalesReps();
  const { data: territories = [] } = useTerritories();
  const { data: dealers = [] } = useDealers();
  const { data: dbContacts = [], isLoading } = useContacts();

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const { toast } = useToast();

  // Build contact list from synced data when DB contacts are empty
  const contacts = dbContacts.length > 0 ? dbContacts.map(c => ({
    id: c.id,
    name: c.name,
    company: c.company || '',
    role: c.role || 'other',
    title: c.title || '',
    phone: c.phone || '',
    cell: c.cell || '',
    email: c.email || '',
    website: c.website || '',
    territory: c.territory || '',
    address: REP_ADDRESSES[(c.email || '').toLowerCase()] || '',
  })) : [
    ...reps.map(r => ({ id: `rep-${r.id}`, name: r.name, company: 'Lineage Collections', role: 'rep', title: 'Sales Representative', phone: r.phone || '', cell: '', email: r.email || '', website: '', territory: '', address: REP_ADDRESSES[(r.email || '').toLowerCase()] || '' })),
    ...dealers.slice(0, 200).map(d => ({ id: `dlr-${d.id}`, name: d.name, company: d.name, role: 'dealer', title: 'Dealer', phone: d.phone || '', cell: '', email: d.email || '', website: d.website || '', territory: '', address: '' })),
  ];

  const filtered = contacts.filter(c => {
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !c.company.toLowerCase().includes(search.toLowerCase())) return false;
    if (roleFilter !== "all" && c.role !== roleFilter) return false;
    return true;
  });

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied!", description: `${label} copied to clipboard.` });
  };

  const roleBadgeClass: Record<string, string> = {
    dealer: 'bg-accent/15 text-accent-foreground',
    rep: 'bg-primary/10 text-primary',
    manager: 'bg-success/10 text-success',
    other: 'bg-muted text-muted-foreground',
  };

  if (isLoading) {
    return (
      <div className="animate-fade-in space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">Directory</h1>
        <p className="page-subtitle">{contacts.length} contacts in your network</p>
      </div>

      <FilterBar
        searchPlaceholder="Search by name or company..."
        searchValue={search}
        onSearchChange={setSearch}
        filters={[
          { label: "Role", value: roleFilter, onChange: setRoleFilter, options: [{ label: 'Dealer', value: 'dealer' }, { label: 'Rep', value: 'rep' }, { label: 'Manager', value: 'manager' }, { label: 'Other', value: 'other' }] },
        ]}
      />

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.slice(0, 60).map(c => (
          <div key={c.id} className="glass-card p-4 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-semibold text-sm">{c.name}</h3>
                <p className="text-xs text-muted-foreground">{c.title}{c.title && c.company ? ' • ' : ''}{c.company}</p>
              </div>
              <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${roleBadgeClass[c.role] || roleBadgeClass.other}`}>{c.role}</span>
            </div>

            <div className="space-y-1.5 text-xs mb-3">
              {c.phone && (
                <div className="flex items-center justify-between group">
                  <span className="text-muted-foreground">{c.phone}</span>
                  <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100" onClick={() => copyToClipboard(c.phone, 'Phone')}>
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              )}
              {c.email && (
                <div className="flex items-center justify-between group">
                  <span className="text-muted-foreground truncate">{c.email}</span>
                  <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100 shrink-0" onClick={() => copyToClipboard(c.email, 'Email')}>
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5 pt-2 border-t">
              {c.email && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.location.href = `mailto:${c.email}`}><Mail className="h-3.5 w-3.5" /></Button>}
              {c.phone && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.location.href = `tel:${c.phone}`}><Phone className="h-3.5 w-3.5" /></Button>}
              {c.website && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.open(c.website.startsWith('http') ? c.website : `https://${c.website}`, '_blank')}><ExternalLink className="h-3.5 w-3.5" /></Button>}
            </div>
          </div>
        ))}
      </div>

      {filtered.length > 60 && <p className="text-center text-muted-foreground py-3 text-xs">Showing 60 of {filtered.length} contacts. Use search to narrow results.</p>}
      {filtered.length === 0 && <p className="text-center text-muted-foreground py-12 text-sm">No contacts match your search.</p>}
    </div>
  );
}
