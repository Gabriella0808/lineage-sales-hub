import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Img, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface CustomerQuoteSentProps {
  customerName?: string
  companyName?: string
  logoUrl?: string
  introMessage?: string
  footerMessage?: string
  contactEmail?: string
  contactPhone?: string
  total?: string
  itemCount?: number
  viewUrl?: string
}

const CustomerQuoteSentEmail = ({
  customerName,
  companyName,
  logoUrl,
  introMessage,
  footerMessage,
  contactEmail,
  contactPhone,
  total,
  itemCount,
  viewUrl,
}: CustomerQuoteSentProps) => {
  const brand = companyName || 'Your Quote'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{brand} sent you a quote{total ? ` (${total})` : ''}</Preview>
      <Body style={main}>
        <Container style={container}>
          {logoUrl ? (
            <Section style={{ textAlign: 'center', marginBottom: 24 }}>
              <Img src={logoUrl} alt={brand} style={{ maxHeight: 64, margin: '0 auto' }} />
            </Section>
          ) : (
            <Heading style={h1}>{brand}</Heading>
          )}

          <Heading style={h2}>
            {customerName ? `Hi ${customerName},` : 'Hi,'}
          </Heading>
          <Text style={text}>
            {introMessage || `Thanks for your interest. Please find your quote below from ${brand}.`}
          </Text>

          <Section style={summaryBox}>
            <Text style={summaryLine}>
              <strong>Quote total:</strong> {total || '—'}
            </Text>
            {itemCount ? (
              <Text style={summaryLine}>
                <strong>Items:</strong> {itemCount}
              </Text>
            ) : null}
          </Section>

          {viewUrl ? (
            <Section style={{ textAlign: 'center', margin: '24px 0' }}>
              <Button href={viewUrl} style={button}>View your quote</Button>
            </Section>
          ) : null}

          {footerMessage ? (
            <>
              <Hr style={hr} />
              <Text style={text}>{footerMessage}</Text>
            </>
          ) : null}

          <Hr style={hr} />
          <Text style={footer}>
            {brand}
            {contactEmail ? ` · ${contactEmail}` : ''}
            {contactPhone ? ` · ${contactPhone}` : ''}
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: CustomerQuoteSentEmail,
  subject: (data: Record<string, any>) => {
    const brand = data?.companyName || 'Your quote'
    return `${brand} — your quote${data?.total ? ` (${data.total})` : ''}`
  },
  displayName: 'Customer quote sent',
  previewData: {
    customerName: 'Jane Smith',
    companyName: 'Acme Furniture Co.',
    introMessage: 'Thanks for stopping by — here is the quote we discussed.',
    footerMessage: 'Quote valid for 30 days. Reply with any questions.',
    contactEmail: 'sales@acme.com',
    contactPhone: '(555) 123-4567',
    total: '$4,250.00',
    itemCount: 3,
    viewUrl: 'https://example.com/q/abc',
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
  margin: '0 0 8px',
  textAlign: 'center' as const,
}
const h2 = { fontSize: '18px', color: '#222', margin: '20px 0 12px' }
const text = { fontSize: '14px', color: '#333', lineHeight: '1.6', margin: '0 0 16px' }
const summaryBox = {
  backgroundColor: 'hsl(40, 15%, 96%)',
  border: '1px solid hsl(220, 13%, 90%)',
  borderRadius: '8px',
  padding: '16px 20px',
  margin: '20px 0',
}
const summaryLine = { fontSize: '14px', color: '#222', margin: '4px 0' }
const button = {
  backgroundColor: 'hsl(220, 35%, 22%)',
  color: '#ffffff',
  padding: '12px 24px',
  borderRadius: '6px',
  textDecoration: 'none',
  fontSize: '14px',
  fontWeight: 600,
}
const hr = { borderColor: 'hsl(220, 13%, 90%)', margin: '24px 0 16px' }
const footer = { fontSize: '12px', color: '#888', textAlign: 'center' as const, margin: '0' }
