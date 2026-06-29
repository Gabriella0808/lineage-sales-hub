import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Lineage Collections'

interface NewLeadAssignedProps {
  repName?: string
  contactName?: string
  dealer?: string
  dealerEmail?: string
  collections?: string
  orderAmount?: string
  market?: string
  notes?: string
  leadRef?: string
}

const NewLeadAssignedEmail = ({
  repName,
  contactName,
  dealer,
  dealerEmail,
  collections,
  orderAmount,
  market,
  notes,
  leadRef,
}: NewLeadAssignedProps) => {
  const capturedAt = new Date().toLocaleDateString('en-US', {
    dateStyle: 'medium',
  })
  return (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>
      {contactName ? `${contactName}` : 'New lead'}
      {dealer ? ` · ${dealer}` : ''}
      {orderAmount ? ` · ${orderAmount}` : ''}
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>New Lead Assigned</Heading>
        <Text style={text}>
          {repName ? `Hi ${repName},` : 'Hi,'} a new lead has just been captured
          {market ? ` at ${market}` : ''} and assigned to you.
        </Text>

        <Section style={detailsBox}>
          <Row label="Contact Name" value={contactName} />
          <Row label="Dealer" value={dealer} />
          <Row label="Dealer Email" value={dealerEmail} />
          <Row label="Collections" value={collections} />
          <Row label="Order Amount" value={orderAmount} />
          <Row label="Captured" value={capturedAt} />
        </Section>

        {notes && notes.trim() ? (
          <Section style={notesBox}>
            <Text style={notesLabel}>Notes</Text>
            <Text style={notesText}>{notes}</Text>
          </Section>
        ) : null}

        <Hr style={hr} />
        <Text style={footer}>--- The {SITE_NAME} Team</Text>
      </Container>
    </Body>
  </Html>
  )
}

const Row = ({ label, value }: { label: string; value?: string }) => (
  <table style={rowTable} cellPadding={0} cellSpacing={0}>
    <tbody>
      <tr>
        <td style={rowLabel}>{label}</td>
        <td style={rowValue}>{value && value.trim() ? value : '---'}</td>
      </tr>
    </tbody>
  </table>
)

export const template = {
  component: NewLeadAssignedEmail,
  subject: (data: Record<string, any>) => {
    const parts: string[] = []
    if (data?.contactName) parts.push(data.contactName)
    if (data?.dealer) parts.push(data.dealer)
    if (data?.orderAmount) parts.push(data.orderAmount)
    const head = parts.length ? parts.join(' · ') : 'New lead assigned'
    return `New lead: ${head}`
  },
  displayName: 'New lead assigned',
  previewData: {
    repName: 'Alex',
    contactName: 'Jane Doe',
    dealer: 'Acme Furniture Co.',
    dealerEmail: 'orders@acmefurniture.com',
    collections: 'Coastal, Heritage',
    orderAmount: '$12,500',
    market: 'High Point Spring 2026',
    notes: 'Customer is interested in our new Coastal line. Follow up within 48 hours.',
  },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily: '"DM Sans", Arial, sans-serif',
}
const container = { padding: '32px 28px', maxWidth: '560px', margin: '0 auto' }
const h1 = {
  fontFamily: '"DM Serif Display", Georgia, serif',
  fontSize: '26px',
  color: 'hsl(220, 35%, 22%)',
  margin: '0 0 20px',
}
const text = {
  fontSize: '14px',
  color: '#333',
  lineHeight: '1.6',
  margin: '0 0 16px',
}
const detailsBox = {
  backgroundColor: 'hsl(40, 15%, 96%)',
  border: '1px solid hsl(220, 13%, 90%)',
  borderRadius: '8px',
  padding: '16px 20px',
  margin: '20px 0',
}
const rowTable = { width: '100%', borderCollapse: 'collapse' as const, margin: '6px 0' }
const rowLabel = {
  fontSize: '13px',
  color: 'hsl(220, 10%, 46%)',
  width: '40%',
  padding: '6px 8px 6px 0',
  verticalAlign: 'top' as const,
}
const rowValue = {
  fontSize: '14px',
  color: '#222',
  fontWeight: 500,
  padding: '6px 0',
  verticalAlign: 'top' as const,
}
const hr = { borderColor: 'hsl(220, 13%, 90%)', margin: '28px 0 16px' }
const footer = { fontSize: '12px', color: '#888', margin: '0' }
const notesBox = {
  backgroundColor: '#ffffff',
  border: '1px solid hsl(220, 13%, 90%)',
  borderRadius: '8px',
  padding: '16px 20px',
  margin: '20px 0',
}
const notesLabel = {
  fontSize: '13px',
  color: 'hsl(220, 10%, 46%)',
  margin: '0 0 8px',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
}
const notesText = {
  fontSize: '14px',
  color: '#222',
  lineHeight: '1.6',
  margin: '0',
  whiteSpace: 'pre-wrap' as const,
}
