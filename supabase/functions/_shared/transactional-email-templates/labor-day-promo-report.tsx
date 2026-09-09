import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface CollectionRow {
  name: string
  total_sales: number
}

interface DealerRow {
  dealer_name: string
  total_sales: number
  goal: number
  pct_goal: number
  collections: CollectionRow[]
}

interface RepSummaryRow {
  rep_name: string
  participating_dealers: number
  dealers_with_sales: number
  total_sales: number
  goal: number
  pct_goal: number
  dealers: DealerRow[]
}

interface LaborDayPromoReportProps {
  updatedAsOf?: string
  totalSales?: number
  totalGoal?: number
  pctGoal?: number
  participatingDealers?: number
  dealersWithSales?: number
  dealersNoSales?: number
  activeSellingReps?: number
  topRepName?: string
  topRepSales?: number
  topDealerName?: string
  topDealerSales?: number
  repRows?: RepSummaryRow[]
  portalUrl?: string
}

const fmt = (n: number) =>
  `$${Math.round(n).toLocaleString('en-US')}`

const fmtPct = (n: number) => `${n.toFixed(1)}%`

// ── Summary card ───────────────────────────────────────────────────────────────

function SummaryCard({ label, value, accent = '#c9a44c' }: { label: string; value: string; accent?: string }) {
  return (
    <table cellPadding={0} cellSpacing={0} style={{ width: '100%', borderCollapse: 'collapse' }}>
      <tbody>
        <tr>
          <td
            style={{
              backgroundColor: accent, height: '4px', lineHeight: '4px', fontSize: '1px',
              borderRadius: '8px 8px 0 0',
              borderLeft: `2px solid ${accent}`, borderRight: `2px solid ${accent}`, borderTop: `2px solid ${accent}`,
            }}
          >&nbsp;</td>
        </tr>
        <tr>
          <td
            style={{
              backgroundColor: '#fdf8ec',
              borderLeft: `2px solid ${accent}`, borderRight: `2px solid ${accent}`, borderBottom: `2px solid ${accent}`,
              borderRadius: '0 0 8px 8px',
              padding: '12px 14px 14px',
            }}
          >
            <p style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#8a6a2f', margin: '0 0 6px', fontFamily: '"DM Sans", Arial, sans-serif' }}>
              {label}
            </p>
            <p style={{ fontFamily: '"DM Serif Display", Georgia, serif', fontSize: '19px', fontWeight: 400, color: '#1e2d47', margin: '0', fontVariantNumeric: 'tabular-nums' }}>
              {value}
            </p>
          </td>
        </tr>
      </tbody>
    </table>
  )
}

function CardRow({ children }: { children: React.ReactNode }) {
  const items = React.Children.toArray(children)
  return (
    <table cellPadding={0} cellSpacing={0} role="presentation" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px' }}>
      <tbody>
        <tr>
          {items.map((child, i) => (
            <React.Fragment key={i}>
              <td style={{ width: `${100 / items.length}%`, verticalAlign: 'top', paddingRight: i < items.length - 1 ? '8px' : 0 }}>
                {child}
              </td>
            </React.Fragment>
          ))}
        </tr>
      </tbody>
    </table>
  )
}

// ── Rep > Dealer > Collection hierarchy table ────────────────────────────────────
// One continuous table, tiered by indentation/weight/color — same shape as the
// portal's Rep/Dealer/Collection/SKU table (SKU level omitted; too granular
// for a daily email), wrapped in one clean bordered card.

function HierarchyTable({ repRows }: { repRows: RepSummaryRow[] }) {
  return (
    <table style={rowTable} cellPadding={0} cellSpacing={0}>
      <thead>
        <tr>
          <th style={th}>Rep / Dealer / Collection</th>
          <th style={thNum}>Detail</th>
          <th style={thNum}>Total Sales</th>
          <th style={thNum}>Goal</th>
          <th style={thNum}>% Goal</th>
        </tr>
      </thead>
      <tbody>
        {repRows.map((rep, repIdx) => (
          <React.Fragment key={rep.rep_name}>
            {/* Rep row */}
            <tr style={repIdx > 0 ? repRowStyle : { ...repRowStyle, borderTop: 'none' }}>
              <td style={tdRep}>{rep.rep_name}</td>
              <td style={tdDetail}>{rep.participating_dealers} dealer{rep.participating_dealers !== 1 ? 's' : ''}</td>
              <td style={tdNumRep}>{fmt(rep.total_sales)}</td>
              <td style={{ ...tdNum, fontWeight: 400, color: '#666' }}>{fmt(rep.goal)}</td>
              <td style={{ ...tdNumRep, color: rep.pct_goal >= 100 ? '#2f7a4f' : '#1e2d47' }}>{fmtPct(rep.pct_goal)}</td>
            </tr>

            {/* Dealer rows */}
            {rep.dealers.map((dealer) => {
              const hasSales = dealer.collections.length > 0
              return (
                <React.Fragment key={`${rep.rep_name}::${dealer.dealer_name}`}>
                  <tr>
                    <td style={{ ...tdDealer, color: hasSales ? '#1a1a1a' : '#999' }}>{dealer.dealer_name}</td>
                    <td style={tdDetail}>
                      {hasSales ? `${dealer.collections.length} collection${dealer.collections.length !== 1 ? 's' : ''}` : '-'}
                    </td>
                    <td style={{ ...tdNum, color: hasSales ? '#1a1a1a' : '#aaa' }}>{fmt(dealer.total_sales)}</td>
                    <td style={{ ...tdNum, fontWeight: 400, color: '#999' }}>{fmt(dealer.goal)}</td>
                    <td style={{ ...tdNum, color: dealer.pct_goal >= 100 ? '#2f7a4f' : hasSales ? '#1a1a1a' : '#aaa' }}>{fmtPct(dealer.pct_goal)}</td>
                  </tr>

                  {!hasSales && (
                    <tr>
                      <td colSpan={5} style={tdNoSales}>No LD26 bookings yet</td>
                    </tr>
                  )}

                  {dealer.collections.map((coll) => (
                    <tr key={`${rep.rep_name}::${dealer.dealer_name}::${coll.name}`}>
                      <td style={tdCollection}>{coll.name}</td>
                      <td style={tdDetail}>-</td>
                      <td style={{ ...tdNum, fontWeight: 500, fontSize: '12px' }}>{fmt(coll.total_sales)}</td>
                      <td style={tdDetail}>-</td>
                      <td style={tdDetail}>-</td>
                    </tr>
                  ))}
                </React.Fragment>
              )
            })}
          </React.Fragment>
        ))}
      </tbody>
    </table>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────────

const LaborDayPromoReportEmail = ({
  updatedAsOf = '',
  totalSales = 0,
  totalGoal = 0,
  pctGoal = 0,
  participatingDealers = 0,
  dealersWithSales = 0,
  dealersNoSales = 0,
  activeSellingReps = 0,
  topRepName = '-',
  topRepSales = 0,
  topDealerName = '-',
  topDealerSales = 0,
  repRows = [],
  portalUrl = 'https://lineage-collections-portal.com/promotions/labor-day-promo',
}: LaborDayPromoReportProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>
      Labor Day Promo · {fmt(totalSales)} of {fmt(totalGoal)} goal ({fmtPct(pctGoal)}) · {participatingDealers} participating dealers
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={eyebrow}>LINEAGE COLLECTIONS · INTERNAL</Text>
        <Heading style={h1}>Labor Day Promo Results</Heading>
        {updatedAsOf ? <Text style={dateLine}>Updated as of latest Acctivate sync - {updatedAsOf}</Text> : null}

        {/* ── Summary cards (3x3 grid) ────────────────────────────────────── */}
        <CardRow>
          <SummaryCard label="Total LD26 Sales" value={fmt(totalSales)} accent="#c9a44c" />
          <SummaryCard label="Total Goal" value={fmt(totalGoal)} accent="#1e2d47" />
          <SummaryCard label="% to Goal" value={fmtPct(pctGoal)} accent={pctGoal >= 100 ? '#2f7a4f' : '#c9a44c'} />
        </CardRow>
        <CardRow>
          <SummaryCard label="Participating Dealers" value={String(participatingDealers)} accent="#1e2d47" />
          <SummaryCard label="Dealers with Sales" value={String(dealersWithSales)} accent="#2f7a4f" />
          <SummaryCard label="Dealers with No Sales" value={String(dealersNoSales)} accent="#a35a3a" />
        </CardRow>
        <CardRow>
          <SummaryCard label="Top Rep" value={`${topRepName} (${fmt(topRepSales)})`} accent="#1e2d47" />
          <SummaryCard label="Top Dealer" value={`${topDealerName} (${fmt(topDealerSales)})`} accent="#1e2d47" />
        </CardRow>

        {/* ── Rep > Dealer > Collection hierarchy ──────────────────────────── */}
        <Text style={sectionHeading}>Rep → Dealer → Collection - every participating dealer, including $0</Text>
        <Section style={hierarchyCard}>
          <HierarchyTable repRows={repRows} />
        </Section>

        {/* CTA */}
        <table cellPadding={0} cellSpacing={0} role="presentation" style={{ margin: '24px auto 0', borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td style={{ backgroundColor: '#c9a44c', borderRadius: '8px' }}>
                <a href={portalUrl} target="_blank" rel="noopener noreferrer" style={ctaButton}>
                  View Labor Day Promo in Portal
                </a>
              </td>
            </tr>
          </tbody>
        </table>
      </Container>
    </Body>
  </Html>
)

// ── Template export ───────────────────────────────────────────────────────────

export const template = {
  component: LaborDayPromoReportEmail,
  subject: 'Labor Day Promo Results - Daily Update',
  displayName: 'Labor Day Promo Report',
  previewData: {
    updatedAsOf: 'September 9, 2026, 8:05 PM ET',
    totalSales: 33150,
    totalGoal: 60000,
    pctGoal: 55.3,
    participatingDealers: 12,
    dealersWithSales: 3,
    dealersNoSales: 9,
    activeSellingReps: 1,
    topRepName: 'Brent Holbrook',
    topRepSales: 33150,
    topDealerName: 'ATLANTIC FINE FURNITURE INC',
    topDealerSales: 11461.5,
    repRows: [
      {
        rep_name: 'Brent Holbrook',
        participating_dealers: 4,
        dealers_with_sales: 3,
        total_sales: 33150,
        goal: 20000,
        pct_goal: 165.75,
        dealers: [
          {
            dealer_name: 'ATLANTIC FINE FURNITURE INC',
            total_sales: 11461.5,
            goal: 5000,
            pct_goal: 229.2,
            collections: [
              { name: 'Cabinet Beds', total_sales: 7913.7 },
              { name: 'Islamorada', total_sales: 2917.8 },
              { name: 'Picket Fence Occassional', total_sales: 630 },
            ],
          },
          {
            dealer_name: 'Coastal Furniture & Accessories',
            total_sales: 11279.1,
            goal: 5000,
            pct_goal: 225.6,
            collections: [
              { name: 'Islamorada', total_sales: 7605.9 },
              { name: 'Surfside', total_sales: 2137.8 },
            ],
          },
          {
            dealer_name: 'Fos Factory Outlet Stores',
            total_sales: 5448.6,
            goal: 5000,
            pct_goal: 109.0,
            collections: [
              { name: 'Islamorada', total_sales: 2192.4 },
              { name: 'Monaco Bleu', total_sales: 1491.3 },
            ],
          },
          {
            dealer_name: 'Royal Furniture',
            total_sales: 0,
            goal: 5000,
            pct_goal: 0,
            collections: [],
          },
        ],
      },
    ],
    portalUrl: 'https://lineage-collections-portal.com/promotions/labor-day-promo',
  },
} satisfies TemplateEntry

// ── Styles ────────────────────────────────────────────────────────────────────

const main = { backgroundColor: '#ffffff', fontFamily: '"DM Sans", Arial, sans-serif' }
const container = { padding: '36px 28px', maxWidth: '640px', margin: '0 auto' }
const eyebrow = { fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#c9a44c', margin: '0 0 14px' }
const h1 = { fontFamily: '"DM Serif Display", Georgia, serif', fontSize: '26px', fontWeight: 400, color: 'hsl(220, 35%, 22%)', margin: '0 0 4px' }
const dateLine = { fontSize: '13px', color: 'hsl(220, 10%, 50%)', margin: '0 0 24px' }

// Body styling mirrors clearance-weekly-report.tsx ("Summer Special" email) —
// soft cream section boxes, understated headers.
const sectionHeading = { fontSize: '12px', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: 'hsl(220, 10%, 46%)', margin: '20px 0 8px' }
const hierarchyCard = { backgroundColor: 'hsl(40, 15%, 97%)', border: '1px solid hsl(220, 13%, 90%)', borderRadius: '10px', padding: '4px 16px 12px', margin: '12px 0' }
const rowTable = { width: '100%', borderCollapse: 'collapse' as const }

const th = { fontSize: '10px', textTransform: 'uppercase' as const, letterSpacing: '0.05em', color: 'hsl(220, 10%, 46%)', padding: '10px 6px 8px 0', textAlign: 'left' as const, borderBottom: '1px solid hsl(220, 13%, 88%)', fontWeight: 600 }
const thNum: typeof th = { ...th, textAlign: 'right' as const, padding: '10px 0 8px 6px' }

// Level 0 — Rep
const repRowStyle = { borderTop: '2px solid hsl(220, 13%, 88%)' }
const tdRep    = { fontSize: '14px', fontWeight: 700, color: '#8a6a2f', padding: '12px 6px 6px 0', letterSpacing: '0.01em' }
const tdNumRep = { fontSize: '14px', fontWeight: 700, color: '#1e2d47', padding: '12px 0 6px 6px', textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' as const, whiteSpace: 'nowrap' as const }

// Level 1 — Dealer
const tdDealer = { fontSize: '13px', fontWeight: 600, padding: '6px 6px 6px 18px' }

// Level 2 — Collection
const tdCollection = { fontSize: '12px', fontWeight: 400, color: '#777', padding: '4px 6px 4px 36px' }

// Shared numeric / detail cells
const tdNum    = { fontSize: '13px', color: '#1a1a1a', fontWeight: 600, padding: '6px 0 6px 6px', textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' as const, whiteSpace: 'nowrap' as const }
const tdDetail = { fontSize: '11px', color: '#999', padding: '6px 0 6px 6px', textAlign: 'right' as const, whiteSpace: 'nowrap' as const }
const tdNoSales = { fontSize: '11px', fontStyle: 'italic' as const, color: '#aaa', padding: '2px 6px 6px 36px' }

const ctaButton = { display: 'inline-block' as const, backgroundColor: '#c9a44c', color: '#1a1a1a', fontSize: '14px', fontWeight: 600, textDecoration: 'none', borderRadius: '8px', padding: '12px 28px', fontFamily: '"DM Sans", Arial, sans-serif' }
