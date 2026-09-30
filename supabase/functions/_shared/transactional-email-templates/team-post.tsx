import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Lineage Collections'

interface TeamPostProps {
  recipientName?: string
  authorName?: string
  title?: string
  excerpt?: string
  attachmentCount?: number
  link?: string
}

const TeamPostEmail = ({
  recipientName,
  authorName,
  title,
  excerpt,
  attachmentCount,
  link,
}: TeamPostProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>
      {authorName ? `${authorName} sent you a message` : 'You have a new message'}
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>You have a new message</Heading>
        <Text style={text}>
          {recipientName ? `Hi ${recipientName},` : 'Hi,'}{' '}
          {authorName ? <strong>{authorName}</strong> : 'Someone'} sent you a message
          {title ? <> - <strong>{title}</strong></> : null}.
        </Text>
        {excerpt ? <Text style={quote}>{excerpt}</Text> : null}
        {attachmentCount ? (
          <Text style={text}>
            {attachmentCount} attachment{attachmentCount === 1 ? '' : 's'} included.
          </Text>
        ) : null}
        {link ? (
          <Button href={link} style={button}>
            View message
          </Button>
        ) : null}
        <Hr style={hr} />
        <Text style={footer}>--- The {SITE_NAME} Team</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: TeamPostEmail,
  subject: (data: Record<string, any>) =>
    `${data?.authorName ?? 'Someone'} sent you a message`,
  displayName: 'Team update',
  previewData: {
    recipientName: 'Gabriella',
    authorName: 'Justin',
    title: 'New showroom hours starting next week',
    excerpt: 'Starting Monday the High Point showroom will open an hour earlier - 8am instead of 9am - through market week.',
    attachmentCount: 1,
    link: 'https://lineage-collections-portal.com/team-updates?post=00000000-0000-0000-0000-000000000000',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: '"DM Sans", Arial, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '560px', margin: '0 auto' }
const h1 = {
  fontFamily: '"DM Serif Display", Georgia, serif',
  fontSize: '26px',
  color: 'hsl(220, 35%, 22%)',
  margin: '0 0 20px',
}
const text = { fontSize: '14px', color: '#333', lineHeight: '1.6', margin: '0 0 16px' }
const quote = {
  fontSize: '14px',
  color: '#444',
  borderLeft: '3px solid hsl(214, 80%, 36%)',
  padding: '10px 14px',
  backgroundColor: 'hsl(214, 40%, 97%)',
  margin: '0 0 20px',
  whiteSpace: 'pre-wrap' as const,
}
const button = {
  backgroundColor: '#C9A24B',
  color: '#1a1a1a',
  padding: '12px 22px',
  borderRadius: '8px',
  fontSize: '14px',
  fontWeight: 700,
  textDecoration: 'none',
  display: 'inline-block',
  margin: '8px 0 4px',
}
const hr = { borderColor: 'hsl(220, 13%, 90%)', margin: '28px 0 16px' }
const footer = { fontSize: '12px', color: '#888', margin: '0' }
