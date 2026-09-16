import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Lineage Collections'

// ── Weekly-mode types ─────────────────────────────────────────────────────────

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
}

// ── Daily-mode types ──────────────────────────────────────────────────────────

interface DailyRepRow {
  rep: string
  total: number
  notes: string
}

interface SkuRepEntry {
  rep: string
  amount: number
}

interface DailySkuRow {
  sku: string
  entries: SkuRepEntry[]
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ClearanceWeeklyReportProps {
  recipientName?: string
  // Weekly mode
  weekLabel?: string
  rows?: RepRow[]
  totalUnits?: number
  totalRevenue?: number
  skusMoved?: number
  portalUrl?: string
  hideUnits?: boolean
  // Daily mode (set dateLabel to activate)
  dateLabel?: string
  dailyTotal?: number
  dailyRepRows?: DailyRepRow[]
  dailySkuRows?: DailySkuRow[]
}

// ── Formatters ────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

// ── Component ─────────────────────────────────────────────────────────────────

const ClearanceWeeklyReportEmail = ({
  recipientName,
  weekLabel,
  rows = [],
  totalUnits = 0,
  totalRevenue = 0,
  skusMoved = 0,
  portalUrl,
  hideUnits = false,
  dateLabel,
  dailyTotal = 0,
  dailyRepRows = [],
  dailySkuRows = [],
}: ClearanceWeeklyReportProps) => {
  const isDaily = !!dateLabel

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>
        {isDaily
          ? `Summer Specials / Clearance Sales Report — ${dateLabel} · ${fmt(dailyTotal)} total bookings`
          : `Summer Special weekly report${weekLabel ? ` · ${weekLabel}` : ''} - ${totalUnits} units sold across ${skusMoved} SKUs`
        }
      </Preview>
      <Body style={main}>
        <Container style={container}>

          {/* ── TITLE ──────────────────────────────────────────────────────── */}
          <Heading style={h1}>
            {isDaily
              ? `Summer Specials / Clearance Sales Report — ${dateLabel}`
              : 'Summer Special - Weekly Report'
            }
          </Heading>

          <Text style={text}>
            {recipientName ? `Hi ${recipientName},` : 'Hi,'}{' '}
            {isDaily
              ? `here are the confirmed Summer Specials / Clearance bookings for ${dateLabel}.`
              : `here is the Summer Special sales summary for ${weekLabel || 'last week'}.`
            }
          </Text>

          {/* ── DAILY MODE ─────────────────────────────────────────────────── */}
          {isDaily && (
            <>
              {/* Summary box */}
              <Section style={summaryBox}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }} cellPadding={0} cellSpacing={0}>
                  <tbody>
                    <tr>
                      <td style={summaryCell}>
                        <div style={summaryNum}>{fmt(dailyTotal)}</div>
                        <div style={summaryLabel}>Total Clearance Bookings</div>
                      </td>
                      <td style={summaryCellBorder}>
                        <div style={summaryNum}>{dailyRepRows.filter(r => r.total > 0).length}</div>
                        <div style={summaryLabel}>Reps with Sales</div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </Section>

              {/* Rep summary table */}
              <Text style={sectionHeading}>Top Reps</Text>
              <Section style={repSection}>
                <table style={rowTable} cellPadding={0} cellSpacing={0}>
                  <thead>
                    <tr>
                      <th style={th}>Rep</th>
                      <th style={thNum}>Total Sales</th>
                      <th style={{ ...th, paddingLeft: '12px' }}>Notes / Strongest Activity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyRepRows.map((r, idx) => (
                      <tr key={r.rep} style={idx % 2 === 0 ? {} : altRow}>
                        <td style={tdName}>
                          <strong>{r.rep}</strong>
                        </td>
                        <td style={{ ...tdNum, color: r.total > 0 ? 'hsl(220, 35%, 22%)' : 'hsl(220, 10%, 60%)' }}>
                          {r.total > 0 ? fmt(r.total) : '$0'}
                        </td>
                        <td style={{ ...tdNotes, color: r.total > 0 ? '#333' : 'hsl(220, 10%, 60%)' }}>
                          {r.notes}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '2px solid hsl(220, 13%, 86%)' }}>
                      <td style={{ ...tdName, fontWeight: 700 }}>Grand Total</td>
                      <td style={{ ...tdNum, fontWeight: 700, color: 'hsl(220, 35%, 22%)' }}>{fmt(dailyTotal)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </Section>

              {/* SKU detail table */}
              {dailySkuRows.length > 0 && (
                <>
                  <Text style={sectionHeading}>Product Detail</Text>
                  <Section style={repSection}>
                    <table style={rowTable} cellPadding={0} cellSpacing={0}>
                      <thead>
                        <tr>
                          <th style={th}>SKU / Product ID</th>
                          <th style={thNum}>Rep</th>
                          <th style={thNum}>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dailySkuRows.flatMap((row, skuIdx) =>
                          row.entries.map((entry, entryIdx) => (
                            <tr
                              key={`${row.sku}-${entry.rep}`}
                              style={(skuIdx + entryIdx) % 2 === 0 ? {} : altRow}
                            >
                              <td style={{ ...tdName, fontFamily: 'monospace', fontSize: '12px' }}>
                                {entryIdx === 0 ? row.sku : ''}
                              </td>
                              <td style={{ ...tdNum, fontWeight: 400, color: '#555' }}>{entry.rep}</td>
                              <td style={tdNum}>{fmt(entry.amount)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </Section>
                </>
              )}
            </>
          )}

          {/* ── WEEKLY MODE ────────────────────────────────────────────────── */}
          {!isDaily && (
            <>
              {/* Summary row */}
              <Section style={summaryBox}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }} cellPadding={0} cellSpacing={0}>
                  <tbody>
                    <tr>
                      {!hideUnits && (
                        <td style={summaryCell}>
                          <div style={summaryNum}>{totalUnits.toLocaleString()}</div>
                          <div style={summaryLabel}>Units Sold</div>
                        </td>
                      )}
                      <td style={hideUnits ? summaryCell : summaryCellBorder}>
                        <div style={summaryNum}>{fmt(totalRevenue)}</div>
                        <div style={summaryLabel}>Gross Revenue</div>
                      </td>
                      <td style={summaryCellBorder}>
                        <div style={summaryNum}>{rows.length}</div>
                        <div style={summaryLabel}>Reps with Sales</div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </Section>

              {/* Per-rep breakdown */}
              {rows.map((repRow, idx) => (
                <React.Fragment key={repRow.rep}>
                  {idx > 0 && <Hr style={thinHr} />}
                  <Section style={repSection}>
                    <table style={rowTable} cellPadding={0} cellSpacing={0}>
                      <thead>
                        <tr>
                          <th style={repHeader} colSpan={3}>{repRow.rep}</th>
                          <th style={repHeaderRight}>{hideUnits ? fmt(repRow.totalRevenue) : `${repRow.totalQty.toLocaleString()} units · ${fmt(repRow.totalRevenue)}`}</th>
                        </tr>
                      </thead>
                    </table>

                    {repRow.collections && repRow.collections.length > 0 && (
                      <table style={{ ...rowTable, marginTop: '4px' }} cellPadding={0} cellSpacing={0}>
                        <thead>
                          <tr>
                            <th style={th}>Collection</th>
                            {!hideUnits && <th style={thNum}>Units</th>}
                            <th style={thNum}>Gross Revenue</th>
                          </tr>
                        </thead>
                        <tbody>
                          {repRow.collections.map((c) => (
                            <tr key={c.collection}>
                              <td style={tdName}>{c.collection}</td>
                              {!hideUnits && <td style={tdNum}>{c.qty.toLocaleString()}</td>}
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
            </>
          )}

          <Hr style={hr} />
          <Text style={footer}>--- The {SITE_NAME} Team</Text>
        </Container>
      </Body>
    </Html>
  )
}

// ── Registration ──────────────────────────────────────────────────────────────

export const template = {
  component: ClearanceWeeklyReportEmail,
  subject: (data: Record<string, any>) => {
    if (data?.dateLabel) return `Summer Specials / Clearance Sales Report — ${data.dateLabel}`
    const wk = data?.weekLabel ? ` (${data.weekLabel})` : ''
    return `Summer Special weekly report${wk}`
  },
  displayName: 'Summer Special report (weekly & daily)',
  previewData: {
    // Daily mode preview — June 28, 2026
    recipientName: 'Justin',
    dateLabel: '28 June',
    dailyTotal: 17252,
    dailyRepRows: [
      { rep: 'DE',    total: 7674, notes: 'Strongest contributor; major activity across DWHITE and EARTHCLAY SKUs' },
      { rep: 'Stew',  total: 3389, notes: 'Strong activity across EARTHCLAY SKUs' },
      { rep: 'Smith', total: 2995, notes: 'Strong DWHITE and FRESHWHITE activity' },
      { rep: 'MD',    total: 2197, notes: 'Activity across B777, D900, D650, and D700 items' },
      { rep: 'Brent', total:  997, notes: 'Activity across D777 and D900 SKUs' },
      { rep: 'All other reps', total: 0, notes: 'No clearance bookings recorded for this date' },
    ],
    dailySkuRows: [
      { sku: 'B77702-SAND',              entries: [{ rep: 'MD',    amount: 175  }] },
      { sku: 'B77703-SAND',              entries: [{ rep: 'MD',    amount: 250  }] },
      { sku: 'B77705-SAND',              entries: [{ rep: 'MD',    amount: 125  }] },
      { sku: 'B90002-DWHITE',            entries: [{ rep: 'DE',    amount: 150  }, { rep: 'Smith', amount: 150 }] },
      { sku: 'B90003-DWHITE',            entries: [{ rep: 'DE',    amount: 200  }, { rep: 'Smith', amount: 200 }] },
      { sku: 'B90004-DWHITE',            entries: [{ rep: 'DE',    amount: 224  }, { rep: 'Smith', amount: 224 }] },
      { sku: 'B90005-DWHITE',            entries: [{ rep: 'DE',    amount: 125  }, { rep: 'Smith', amount: 125 }] },
      { sku: 'B90032-DWHITE',            entries: [{ rep: 'DE',    amount: 150  }] },
      { sku: 'B90035-DWHITE',            entries: [{ rep: 'DE',    amount: 349  }] },
      { sku: 'B90036-DWHITE',            entries: [{ rep: 'DE',    amount: 350  }] },
      { sku: 'B90038-DWHITE',            entries: [{ rep: 'DE',    amount: 50   }] },
      { sku: 'B900KBED-STORAGE-DWHITE',  entries: [{ rep: 'DE',    amount: 300  }] },
      { sku: 'D77781-SAND',              entries: [{ rep: 'Brent', amount: 150  }, { rep: 'Smith', amount: 150 }] },
      { sku: 'D77785-BASE-SAND',         entries: [{ rep: 'Brent', amount: 274  }] },
      { sku: 'D77785-SAND',              entries: [{ rep: 'Smith', amount: 399  }] },
      { sku: 'D77785-TOP-GLASS',         entries: [{ rep: 'Brent', amount: 125  }] },
      { sku: 'D90015-DWHITE',            entries: [{ rep: 'DE',    amount: 399  }, { rep: 'Smith', amount: 399 }] },
      { sku: 'D90081-DWHITE',            entries: [{ rep: 'Brent', amount: 150  }, { rep: 'DE', amount: 300 }, { rep: 'MD', amount: 150 }, { rep: 'Smith', amount: 150 }] },
      { sku: 'D90085-DWHITE',            entries: [{ rep: 'Brent', amount: 298  }, { rep: 'DE', amount: 596 }, { rep: 'MD', amount: 298 }, { rep: 'Smith', amount: 298 }] },
      { sku: 'FL-B65002-FRESHWHITE',     entries: [{ rep: 'Smith', amount: 150  }] },
      { sku: 'FL-B65003-FRESHWHITE',     entries: [{ rep: 'Smith', amount: 175  }] },
      { sku: 'FL-B65005-FRESHWHITE',     entries: [{ rep: 'Smith', amount: 125  }] },
      { sku: 'FL-B70002-EARTHCLAY',      entries: [{ rep: 'DE',    amount: 105  }] },
      { sku: 'FL-B70003-EARTHCLAY',      entries: [{ rep: 'DE',    amount: 175  }] },
      { sku: 'FL-B70004-SET-EARTHCLAY',  entries: [{ rep: 'DE',    amount: 1196 }, { rep: 'MD', amount: 299 }, { rep: 'Stew', amount: 299 }] },
      { sku: 'FL-B70005-EARTHCLAY',      entries: [{ rep: 'DE',    amount: 95   }, { rep: 'Stew', amount: 190 }] },
      { sku: 'FL-B70031-EARTHCLAY',      entries: [{ rep: 'DE',    amount: 150  }, { rep: 'Stew', amount: 150 }] },
      { sku: 'FL-B70033-EARTHCLAY',      entries: [{ rep: 'DE',    amount: 150  }, { rep: 'Stew', amount: 600 }] },
      { sku: 'FL-B70036-EARTHCLAY',      entries: [{ rep: 'DE',    amount: 350  }, { rep: 'Stew', amount: 350 }] },
      { sku: 'FL-B70037-EARTHCLAY',      entries: [{ rep: 'DE',    amount: 400  }, { rep: 'Stew', amount: 400 }] },
      { sku: 'FL-B70038-EARTHCLAY',      entries: [{ rep: 'DE',    amount: 50   }, { rep: 'Stew', amount: 50  }] },
      { sku: 'FL-B700KBED-EARTHCLAY',    entries: [{ rep: 'DE',    amount: 300  }, { rep: 'Stew', amount: 600 }] },
      { sku: 'FL-B700QBED-EARTHCLAY',    entries: [{ rep: 'Stew',  amount: 300  }] },
      { sku: 'FL-D65016-FRESHWHITE',     entries: [{ rep: 'MD',    amount: 450  }, { rep: 'Smith', amount: 450 }] },
      { sku: 'FL-D65085-FRESHWHITE',     entries: [{ rep: 'DE',    amount: 675  }] },
      { sku: 'FL-D70081-EARTHCLAY',      entries: [{ rep: 'DE',    amount: 200  }, { rep: 'MD', amount: 100 }, { rep: 'Stew', amount: 100 }] },
      { sku: 'FL-D70082-EARTHCLAY',      entries: [{ rep: 'DE',    amount: 50   }, { rep: 'MD', amount: 50  }, { rep: 'Stew', amount: 50  }] },
      { sku: 'FL-D70085-EARTHCLAY',      entries: [{ rep: 'DE',    amount: 285  }] },
      { sku: 'FL-D70086-BASE-EARTHCLAY', entries: [{ rep: 'MD',    amount: 100  }] },
      { sku: 'FL-D70086-EARTHCLAY',      entries: [{ rep: 'DE',    amount: 300  }, { rep: 'Stew', amount: 300 }] },
      { sku: 'FL-D70086-TOP-EARTHCLAY',  entries: [{ rep: 'MD',    amount: 200  }] },
    ],
    portalUrl: 'https://lineage-collections-portal.com/clearance/analytics',
  },
} satisfies TemplateEntry

// ── Styles ────────────────────────────────────────────────────────────────────

const main       = { backgroundColor: '#ffffff', fontFamily: '"DM Sans", Arial, sans-serif' }
const container  = { padding: '32px 28px', maxWidth: '600px', margin: '0 auto' }
const h1         = { fontFamily: '"DM Serif Display", Georgia, serif', fontSize: '22px', color: 'hsl(220, 35%, 22%)', margin: '0 0 20px' }
const text       = { fontSize: '14px', color: '#333', lineHeight: '1.6', margin: '0 0 16px' }
const sectionHeading = { fontSize: '12px', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: 'hsl(220, 10%, 46%)', margin: '20px 0 8px' }
const summaryBox = { backgroundColor: 'hsl(40, 15%, 96%)', border: '1px solid hsl(220, 13%, 90%)', borderRadius: '8px', padding: '16px 20px', margin: '20px 0' }
const summaryCell = { textAlign: 'center' as const, padding: '8px 16px' }
const summaryCellBorder = { ...summaryCell, borderLeft: '1px solid hsl(220, 13%, 88%)' }
const summaryNum   = { fontSize: '22px', fontWeight: 700, color: 'hsl(220, 35%, 22%)', fontVariantNumeric: 'tabular-nums' as const }
const summaryLabel = { fontSize: '11px', textTransform: 'uppercase' as const, letterSpacing: '0.05em', color: 'hsl(220, 10%, 50%)', marginTop: '4px' }
const repSection   = { backgroundColor: 'hsl(40, 15%, 97%)', border: '1px solid hsl(220, 13%, 90%)', borderRadius: '8px', padding: '12px 16px', margin: '12px 0' }
const rowTable     = { width: '100%', borderCollapse: 'collapse' as const }
const repHeader      = { fontSize: '13px', fontWeight: 700, color: '#C5A572', padding: '4px 0 8px', textAlign: 'left' as const, borderBottom: '1px solid hsl(220, 13%, 88%)' }
const repHeaderRight = { ...repHeader, textAlign: 'right' as const, fontSize: '12px', fontWeight: 500, color: 'hsl(220, 10%, 46%)' }
const th    = { fontSize: '11px', textTransform: 'uppercase' as const, letterSpacing: '0.05em', color: 'hsl(220, 10%, 46%)', padding: '6px 6px 6px 0', textAlign: 'left' as const, borderBottom: '1px solid hsl(220, 13%, 88%)' }
const thNum = { ...th, textAlign: 'right' as const, padding: '6px 0 6px 6px' }
const tdName  = { fontSize: '13px', color: '#222', padding: '8px 6px 8px 0' }
const tdNum   = { fontSize: '13px', color: '#222', fontWeight: 600, padding: '8px 0 8px 6px', textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' as const, whiteSpace: 'nowrap' as const }
const tdNotes = { fontSize: '12px', color: '#444', padding: '8px 0 8px 12px', lineHeight: '1.4' }
const altRow  = { backgroundColor: 'hsl(220, 15%, 97%)' }
const hr      = { borderColor: 'hsl(220, 13%, 90%)', margin: '28px 0 16px' }
const footer  = { fontSize: '12px', color: '#888', margin: '0' }
const thinHr  = { borderColor: 'hsl(220, 13%, 88%)', margin: '12px 0', borderWidth: '1px 0 0 0' }
