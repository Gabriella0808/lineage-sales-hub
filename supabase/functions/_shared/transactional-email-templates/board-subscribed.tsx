import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Lineage Portal'

interface BoardSubscribedProps {
  recipientName?: string
  inviterName?: string
  boardName?: string
  boardDescription?: string
  link?: string
}

const BoardSubscribedEmail = ({
  recipientName,
  inviterName,
  boardName,
  boardDescription,
  link,
}: BoardSubscribedProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>
      Your portal access was updated
      {boardName ? ` for ${boardName}` : ''}
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Board access updated</Heading>
        <Text style={text}>
          {recipientName ? `Hi ${recipientName},` : 'Hi,'}{' '}
          your {SITE_NAME} account now has access to{' '}
          <strong>{boardName || 'a shared board'}</strong>.
        </Text>
        {boardDescription ? (
          <Text style={quote}>{boardDescription}</Text>
        ) : null}
        <Text style={text}>
          This account notification was sent because your portal access changed.
        </Text>
        {link ? (
          <Button href={link} style={button}>
            Open board
          </Button>
        ) : null}
        <Hr style={hr} />
        <Text style={footer}>The {SITE_NAME} Team</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: BoardSubscribedEmail,
  subject: (data: Record<string, any>) => {
    const board = data?.boardName ? `: ${data.boardName}` : ''
    return `Lineage Portal board access updated${board}`
  },
  displayName: 'Board subscription invite',
  previewData: {
    recipientName: 'Scott',
    inviterName: 'Jordan',
    boardName: 'Q1 Trade Show Prep',
    boardDescription: 'Tasks for High Point market planning.',
    link: 'https://www.lineage-portal.com/tasks',
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
const quote = {
  fontSize: '14px',
  color: '#555',
  fontStyle: 'italic' as const,
  borderLeft: '3px solid hsl(40, 50%, 55%)',
  padding: '8px 14px',
  backgroundColor: 'hsl(40, 15%, 96%)',
  margin: '0 0 16px',
}
const button = {
  backgroundColor: 'hsl(220, 35%, 22%)',
  color: '#ffffff',
  padding: '12px 22px',
  borderRadius: '6px',
  fontSize: '14px',
  fontWeight: 600,
  textDecoration: 'none',
  display: 'inline-block',
  margin: '8px 0 4px',
}
const hr = { borderColor: 'hsl(220, 13%, 90%)', margin: '28px 0 16px' }
const footer = { fontSize: '12px', color: '#888', margin: '0' }
