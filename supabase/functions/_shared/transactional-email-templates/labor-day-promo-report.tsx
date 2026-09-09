import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Lineage Collections'

interface RepSummaryRow {
  rep_name: string
  participating_dealers: number
  dealers_with_sales: number
  total_sales: number
  goal: number
  pct_goal: number
}

interface DealerDetailRow {
  rep_name: string
  dealer_name: string
  total_sales: number
  goal: number
  pct_goal: number
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
  dealerRows?: DealerDetailRow[]  // top 20 by sales — full list stays in the portal
  noSalesDealerCount?: number
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

// ── Rep table (Summer Special cream-box look) ────────────────────────────────────

function RepTable({ rows }: { rows: RepSummaryRow[] }) {
  return (
    <table style={rowTable} cellPadding={0} cellSpacing={0}>
      <thead>
        <tr>
          <th style={th}>Rep</th>
          <th style={thNum}>Dealers</th>
          <th style={thNum}>With Sales</th>
          <th style={thNum}>Total Sales</th>
          <th style={thNum}>Goal</th>
          <th style={thNum}>% Goal</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, idx) => (
          <tr key={r.rep_name} style={idx % 2 === 0 ? {} : altRow}>
            <td style={tdName}><strong>{r.rep_name}</strong></td>
            <td style={tdNum}>{r.participating_dealers}</td>
            <td style={tdNum}>{r.dealers_with_sales}</td>
            <td style={{ ...tdNum, color: r.total_sales > 0 ? 'hsl(220, 35%, 22%)' : 'hsl(220, 10%, 60%)' }}>{fmt(r.total_sales)}</td>
            <td style={{ ...tdNum, fontWeight: 400, color: '#555' }}>{fmt(r.goal)}</td>
            <td style={{ ...tdNum, color: r.pct_goal >= 100 ? '#2f7a4f' : '#1a1a1a' }}>{fmtPct(r.pct_goal)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Dealer table (Summer Special cream-box look) ──────────────────────────────────

function DealerTable({ rows }: { rows: DealerDetailRow[] }) {
  return (
    <table style={rowTable} cellPadding={0} cellSpacing={0}>
      <thead>
        <tr>
          <th style={th}>Rep</th>
          <th style={th}>Dealer</th>
          <th style={thNum}>Total Sales</th>
          <th style={thNum}>Goal</th>
          <th style={thNum}>% Goal</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, idx) => (
          <tr key={`${r.rep_name}::${r.dealer_name}::${idx}`} style={idx % 2 === 0 ? {} : altRow}>
            <td style={{ ...tdName, fontWeight: 400, color: '#555' }}>{r.rep_name}</td>
            <td style={tdName}>{r.dealer_name}</td>
            <td style={{ ...tdNum, color: r.total_sales > 0 ? 'hsl(220, 35%, 22%)' : 'hsl(220, 10%, 60%)' }}>{fmt(r.total_sales)}</td>
            <td style={{ ...tdNum, fontWeight: 400, color: '#555' }}>{fmt(r.goal)}</td>
            <td style={{ ...tdNum, color: r.pct_goal >= 100 ? '#2f7a4f' : '#1a1a1a' }}>{fmtPct(r.pct_goal)}</td>
          </tr>
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
  topRepName = '—',
  topRepSales = 0,
  topDealerName = '—',
  topDealerSales = 0,
  repRows = [],
  dealerRows = [],
  noSalesDealerCount = 0,
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
        {updatedAsOf ? <Text style={dateLine}>Updated as of latest Acctivate sync — {updatedAsOf}</Text> : null}

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
          <SummaryCard label="Active Selling Reps" value={String(activeSellingReps)} accent="#c9a44c" />
          <SummaryCard label="Top Rep" value={`${topRepName} (${fmt(topRepSales)})`} accent="#1e2d47" />
          <SummaryCard label="Top Dealer" value={`${topDealerName} (${fmt(topDealerSales)})`} accent="#1e2d47" />
        </CardRow>

        {/* ── Rep summary table ────────────────────────────────────────────── */}
        <Text style={sectionHeading}>Rep Summary — sorted by total sales</Text>
        <Section style={repSection}>
          <RepTable rows={repRows} />
        </Section>

        {/* ── Dealer detail table ──────────────────────────────────────────── */}
        <Text style={sectionHeading}>Dealer Detail — top {dealerRows.length} by sales</Text>
        <Section style={repSection}>
          <DealerTable rows={dealerRows} />
          {noSalesDealerCount > 0 && (
            <Text style={{ fontSize: '12px', color: '#888', margin: '14px 0 0', fontFamily: '"DM Sans", Arial, sans-serif' }}>
              + {noSalesDealerCount} more participating dealer{noSalesDealerCount !== 1 ? 's' : ''} with no LD26 sales yet.
              Full roster and detail in the portal.
            </Text>
          )}
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

        <Hr style={hr} />
        <Text style={footer}>
          Internal only — sent to admin/manager portal users. Sent automatically from the {SITE_NAME} Admin Workspace.
        </Text>
      </Container>
    </Body>
  </Html>
)

// ── Template export ───────────────────────────────────────────────────────────

export const template = {
  component: LaborDayPromoReportEmail,
  subject: 'Labor Day Promo Results — Daily Update',
  displayName: 'Labor Day Promo Report',
  previewData: {
    updatedAsOf: 'September 9, 2026, 8:05 PM ET',
    totalSales: 112095,
    totalGoal: 410000,
    pctGoal: 27.3,
    participatingDealers: 82,
    dealersWithSales: 34,
    dealersNoSales: 48,
    activeSellingReps: 9,
    topRepName: 'Skip Camillo',
    topRepSales: 24800,
    topDealerName: 'Royal Furniture',
    topDealerSales: 8200,
    repRows: [
      { rep_name: 'Skip Camillo', participating_dealers: 9, dealers_with_sales: 5, total_sales: 24800, goal: 45000, pct_goal: 55.1 },
      { rep_name: 'Dave Ervin', participating_dealers: 8, dealers_with_sales: 4, total_sales: 18200, goal: 40000, pct_goal: 45.5 },
    ],
    dealerRows: [
      { rep_name: 'Skip Camillo', dealer_name: 'Royal Furniture', total_sales: 8200, goal: 5000, pct_goal: 164 },
      { rep_name: 'Dave Ervin', dealer_name: 'Hudsons Furniture', total_sales: 6100, goal: 5000, pct_goal: 122 },
    ],
    noSalesDealerCount: 48,
    portalUrl: 'https://lineage-collections-portal.com/promotions/labor-day-promo',
  },
} satisfies TemplateEntry

// ── Styles ────────────────────────────────────────────────────────────────────

const main = { backgroundColor: '#ffffff', fontFamily: '"DM Sans", Arial, sans-serif' }
const container = { padding: '36px 28px', maxWidth: '620px', margin: '0 auto' }
const eyebrow = { fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#c9a44c', margin: '0 0 14px' }
const h1 = { fontFamily: '"DM Serif Display", Georgia, serif', fontSize: '26px', fontWeight: 400, color: 'hsl(220, 35%, 22%)', margin: '0 0 4px' }
const dateLine = { fontSize: '13px', color: 'hsl(220, 10%, 50%)', margin: '0 0 24px' }

// Body styling mirrors clearance-weekly-report.tsx ("Summer Special" email) —
// soft cream section boxes, understated headers, alternating row stripes.
const sectionHeading = { fontSize: '12px', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: 'hsl(220, 10%, 46%)', margin: '20px 0 8px' }
const repSection = { backgroundColor: 'hsl(40, 15%, 97%)', border: '1px solid hsl(220, 13%, 90%)', borderRadius: '8px', padding: '12px 16px', margin: '12px 0' }
const rowTable = { width: '100%', borderCollapse: 'collapse' as const }

const th = { fontSize: '11px', textTransform: 'uppercase' as const, letterSpacing: '0.05em', color: 'hsl(220, 10%, 46%)', padding: '6px 6px 6px 0', textAlign: 'left' as const, borderBottom: '1px solid hsl(220, 13%, 88%)', fontWeight: 600 }
const thNum: typeof th = { ...th, textAlign: 'right' as const, padding: '6px 0 6px 6px' }

const tdName = { fontSize: '13px', color: '#222', padding: '8px 6px 8px 0' }
const tdNum  = { fontSize: '13px', color: '#222', fontWeight: 600, padding: '8px 0 8px 6px', textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' as const, whiteSpace: 'nowrap' as const }
const altRow = { backgroundColor: 'hsl(220, 15%, 97%)' }

const hr = { borderColor: 'hsl(220, 13%, 90%)', margin: '28px 0 16px' }
const footer = { fontSize: '12px', color: '#999999', margin: '0' }
const ctaButton = { display: 'inline-block' as const, backgroundColor: '#c9a44c', color: '#1a1a1a', fontSize: '14px', fontWeight: 600, textDecoration: 'none', borderRadius: '8px', padding: '12px 28px', fontFamily: '"DM Sans", Arial, sans-serif' }
