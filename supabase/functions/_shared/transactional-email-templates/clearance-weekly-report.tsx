import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Lineage Collections'

interface CollectionRow {
  collection: string
  qty: number
  revenue: number
}

interface RepRow {
  rep: string
  totalQty: number
  totalRevenue: number
  collections?: CollectionRow[]
  points?: number
  dealersShopped?: number
  rank?: number
}

interface ClearanceWeeklyReportProps {
  recipientName?: string
  weekLabel?: string
  rows?: RepRow[]
  totalUnits?: number
  totalRevenue?: number
  skusMoved?: number
  portalUrl?: string
  contestEndLabel?: string
  pointsPerBonus?: number
  bonusAmount?: number
}

const fmt = (n: number) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

const ClearanceWeeklyReportEmail = ({
  recipientName,
  weekLabel,
  rows = [],
  totalUnits = 0,
  totalRevenue = 0,
  skusMoved = 0,
  portalUrl,
  contestEndLabel,
  pointsPerBonus = 100,
  bonusAmount = 500,
}: ClearanceWeeklyReportProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>
      Clearance weekly report{weekLabel ? ` · ${weekLabel}` : ''} — {totalUnits} units sold across{' '}
      {skusMoved} SKUs
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Clearance Products – Weekly Report</Heading>
        <Text style={text}>
          {recipientName ? `Hi ${recipientName},` : 'Hi,'} here is the clearance product sales
          summary for {weekLabel || 'last week'}.
        </Text>

        {/* Summary row */}
        <Section style={summaryBox}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }} cellPadding={0} cellSpacing={0}>
            <tbody>
              <tr>
                <td style={summaryCell}>
                  <div style={summaryNum}>{totalUnits.toLocaleString()}</div>
                  <div style={summaryLabel}>Units Sold</div>
                </td>
                <td style={summaryCellBorder}>
                  <div style={summaryNum}>{fmt(totalRevenue)}</div>
                  <div style={summaryLabel}>Revenue</div>
                </td>
                <td style={summaryCellBorder}>
                  <div style={summaryNum}>{rows.length}</div>
                  <div style={summaryLabel}>Reps with Sales</div>
                </td>

              </tr>
            </tbody>
          </table>
        </Section>

        {/* Contest leaderboard */}
        {rows.some((r) => (r.points ?? 0) > 0) && (
          <Section style={contestBox}>
            <Heading style={contestH2}>🏆 Clearance Sales Contest</Heading>
            <Text style={contestSub}>
              Earn ${bonusAmount} for every {pointsPerBonus} points.
              {contestEndLabel ? ` Contest ends ${contestEndLabel}.` : ''}
            </Text>
            {rows
              .slice()
              .sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
              .map((r, i) => {
                const pts = r.points ?? 0
                const tier = Math.floor(pts / pointsPerBonus)
                const intoTier = pts - tier * pointsPerBonus
                const pct = Math.max(0, Math.min(100, (intoTier / pointsPerBonus) * 100))
                const earned = tier * bonusAmount
                const toNext = pointsPerBonus - intoTier
                return (
                  <div key={r.rep} style={lbRow}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }} cellPadding={0} cellSpacing={0}>
                      <tbody>
                        <tr>
                          <td style={lbName}>
                            <span style={lbRank}>#{i + 1}</span> {r.rep}
                          </td>
                          <td style={lbPts}>
                            {pts.toLocaleString()} pts{earned > 0 ? ` · ${fmt(earned)} earned` : ''}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <div style={barOuter}>
                      <div style={{ ...barInner, width: `${pct}%` }} />
                    </div>
                    <div style={lbMeta}>
                      {toNext} pts to next ${bonusAmount} · {r.dealersShopped ?? 0} dealers shopped · {fmt(r.totalRevenue)} sales
                    </div>
                  </div>
                )
              })}
          </Section>
        )}

        {/* Per-rep breakdown */}
        {rows.map((repRow, idx) => (
          <React.Fragment key={repRow.rep}>
            {idx > 0 && <Hr style={thinHr} />}
            <Section style={repSection}>
              <table style={rowTable} cellPadding={0} cellSpacing={0}>
                <thead>
                  <tr>
                    <th style={repHeader} colSpan={3}>{repRow.rep}</th>
                    <th style={repHeaderRight}>{repRow.totalQty.toLocaleString()} units · {fmt(repRow.totalRevenue)}</th>
                  </tr>
                </thead>
              </table>

              {repRow.collections && repRow.collections.length > 0 && (
                <table style={{ ...rowTable, marginTop: '4px' }} cellPadding={0} cellSpacing={0}>
                  <thead>
                    <tr>
                      <th style={th}>Collection</th>
                      <th style={thNum}>Units</th>
                      <th style={thNum}>Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {repRow.collections.map((c) => (
                      <tr key={c.collection}>
                        <td style={tdName}>{c.collection}</td>
                        <td style={tdNum}>{c.qty.toLocaleString()}</td>
                        <td style={tdNum}>{fmt(c.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

            </Section>
          </React.Fragment>
        ))}



        {rows.length === 0 && (
          <Text style={{ ...text, color: '#888' }}>No clearance product sales recorded for this week.</Text>
        )}

        <Hr style={hr} />

        <Text style={footer}>— The {SITE_NAME} Team</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: ClearanceWeeklyReportEmail,
  subject: (data: Record<string, any>) => {
    const wk = data?.weekLabel ? ` (${data.weekLabel})` : ''
    return `Clearance products weekly report${wk}`
  },
  displayName: 'Clearance products weekly report',
  previewData: {
    recipientName: 'Scott',
    weekLabel: 'Jun 2 - Jun 8, 2026',
    totalUnits: 47,
    totalRevenue: 3850,
    skusMoved: 12,
    rows: [
      {
        rep: 'Will',
        totalQty: 28,
        totalRevenue: 2240,
        points: 142,
        dealersShopped: 7,
        collections: [
          { collection: 'Harbor', qty: 20, revenue: 1600 },
          { collection: 'Clearance', qty: 8, revenue: 640 },
        ],
      },
      {
        rep: 'Mateo',
        totalQty: 19,
        totalRevenue: 1610,
        points: 96,
        dealersShopped: 5,
        collections: [
          { collection: 'Harbor', qty: 19, revenue: 1610 },
        ],
      },
    ],
    portalUrl: 'https://www.lineage-managerhub.com/clearance/analytics',
    contestEndLabel: 'Aug 31',
    pointsPerBonus: 100,
    bonusAmount: 500,
  },

} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: '"DM Sans", Arial, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '600px', margin: '0 auto' }
const h1 = {
  fontFamily: '"DM Serif Display", Georgia, serif',
  fontSize: '26px',
  color: 'hsl(220, 35%, 22%)',
  margin: '0 0 20px',
}
const text = { fontSize: '14px', color: '#333', lineHeight: '1.6', margin: '0 0 16px' }
const summaryBox = {
  backgroundColor: 'hsl(40, 15%, 96%)',
  border: '1px solid hsl(220, 13%, 90%)',
  borderRadius: '8px',
  padding: '16px 20px',
  margin: '20px 0',
}
const summaryCell = { textAlign: 'center' as const, padding: '8px 16px' }
const summaryCellBorder = {
  ...summaryCell,
  borderLeft: '1px solid hsl(220, 13%, 88%)',
}
const summaryNum = { fontSize: '22px', fontWeight: 700, color: 'hsl(220, 35%, 22%)', fontVariantNumeric: 'tabular-nums' as const }
const summaryLabel = { fontSize: '11px', textTransform: 'uppercase' as const, letterSpacing: '0.05em', color: 'hsl(220, 10%, 50%)', marginTop: '4px' }
const repSection = {
  backgroundColor: 'hsl(40, 15%, 97%)',
  border: '1px solid hsl(220, 13%, 90%)',
  borderRadius: '8px',
  padding: '12px 16px',
  margin: '12px 0',
}
const rowTable = { width: '100%', borderCollapse: 'collapse' as const }
const repHeader = {
  fontSize: '13px',
  fontWeight: 700,
  color: '#C5A572',
  padding: '4px 0 8px',
  textAlign: 'left' as const,
  borderBottom: '1px solid hsl(220, 13%, 88%)',
}
const repHeaderRight = {
  ...repHeader,
  textAlign: 'right' as const,
  fontSize: '12px',
  fontWeight: 500,
  color: 'hsl(220, 10%, 46%)',
}
const th = {
  fontSize: '11px',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
  color: 'hsl(220, 10%, 46%)',
  padding: '6px 6px 6px 0',
  textAlign: 'left' as const,
  borderBottom: '1px solid hsl(220, 13%, 88%)',
}
const thNum = { ...th, textAlign: 'right' as const, padding: '6px 0 6px 6px' }
const tdName = { fontSize: '13px', color: '#222', padding: '8px 6px 8px 0' }

const tdNum = {
  fontSize: '13px',
  color: '#222',
  fontWeight: 600,
  padding: '8px 0 8px 6px',
  textAlign: 'right' as const,
  fontVariantNumeric: 'tabular-nums' as const,
  whiteSpace: 'nowrap' as const,
}
const hr = { borderColor: 'hsl(220, 13%, 90%)', margin: '28px 0 16px' }
const footer = { fontSize: '12px', color: '#888', margin: '0' }
const thinHr = { borderColor: 'hsl(220, 13%, 88%)', margin: '12px 0', borderWidth: '1px 0 0 0' }
const contestBox = {
  backgroundColor: 'hsl(214, 80%, 97%)',
  border: '1px solid hsl(214, 60%, 85%)',
  borderRadius: '8px',
  padding: '16px 20px',
  margin: '20px 0',
}
const contestH2 = {
  fontFamily: '"DM Serif Display", Georgia, serif',
  fontSize: '18px',
  color: 'hsl(214, 80%, 36%)',
  margin: '0 0 4px',
}
const contestSub = { fontSize: '12px', color: 'hsl(220, 10%, 46%)', margin: '0 0 14px' }
const lbRow = { padding: '10px 0', borderTop: '1px solid hsl(214, 30%, 90%)' }
const lbName = { fontSize: '14px', color: 'hsl(220, 35%, 22%)', fontWeight: 600, padding: '0 0 4px' }
const lbRank = { color: 'hsl(214, 90%, 52%)', fontWeight: 700, marginRight: '6px' }
const lbPts = { fontSize: '13px', color: 'hsl(220, 35%, 22%)', fontWeight: 600, textAlign: 'right' as const, padding: '0 0 4px', fontVariantNumeric: 'tabular-nums' as const, whiteSpace: 'nowrap' as const }
const barOuter = { width: '100%', height: '8px', backgroundColor: 'hsl(214, 30%, 90%)', borderRadius: '4px', overflow: 'hidden' as const, margin: '4px 0 6px' }
const barInner = { height: '8px', backgroundColor: 'hsl(214, 90%, 52%)', borderRadius: '4px' }
const lbMeta = { fontSize: '11px', color: 'hsl(220, 10%, 46%)' }
