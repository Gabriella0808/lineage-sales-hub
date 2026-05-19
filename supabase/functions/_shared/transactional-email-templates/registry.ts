/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  to?: string
  displayName?: string
  previewData?: Record<string, any>
}

import { template as newLeadAssigned } from './new-lead-assigned.tsx'
import { template as boardSubscribed } from './board-subscribed.tsx'
import { template as taskDueToday } from './task-due-today.tsx'
import { template as customerQuoteSent } from './customer-quote-sent.tsx'
import { template as taskAssigned } from './task-assigned.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'new-lead-assigned': newLeadAssigned,
  'board-subscribed': boardSubscribed,
  'task-due-today': taskDueToday,
  'customer-quote-sent': customerQuoteSent,
  'task-assigned': taskAssigned,
}
