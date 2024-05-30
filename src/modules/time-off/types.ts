export enum TimeOffRequestStatus {
  Open = 'open',
  Approved = 'approved',
  Rejected = 'rejected',
  Cancelled = 'cancelled',
}

export enum TimeOffRequestUnit {
  Hour = 'hour',
  Day = 'day',
}

export interface TimeOffRequest {
  id: string
  createdAt: Date
  updatedAt: Date
  status: TimeOffRequestStatus
  unit: TimeOffRequestUnit
  dates: string[]
  unitsPerDay: Record<string, number>
  startDate: string // YYYY-MM-DD
  endDate: string
  userId: string
  externalIds: Record<string, string>
}

export interface PublicHoliday {
  id: string
  name: string
  date: string // YYYY-MM-DD
  calendarId: string
  externalIds: Record<string, string>
  createdAt: Date
  updatedAt: Date
}
