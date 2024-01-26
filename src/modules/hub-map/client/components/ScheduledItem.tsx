import React from 'react'
import { cn } from '#client/utils'
import {
  ColorsBg,
  ColorsBorder,
  ColorsHover,
  ScheduledItemType,
  StatusColor,
} from '#shared/types'
import dayjs from 'dayjs'
import { FButton, P } from '#client/components/ui'

export const PageUrls: Record<string, string> = {
  event: '/events',
}

const DateHeader = ({ dateValue }: { dateValue: string | Date }) => {
  const date = dayjs(dateValue).isToday()
    ? `Today`
    : dayjs(dateValue).format('dddd')
  return (
    <P textType="additional" className="mt-0 mb-0">
      <span
        className={cn(
          date === 'Today' ? 'text-accents-red' : 'text-text-secondary'
        )}
      >
        {date}
        {' · '}
      </span>
      <span className="text-text-secondary">
        {dayjs(dateValue).format('D MMMM')}
      </span>
    </P>
  )
}

export const ScheduledItem = ({
  sheduledItem,
  selected,
  onClick,
  onEntityCancel,
}: {
  sheduledItem: ScheduledItemType
  selected: string | null
  onClick: (item: ScheduledItemType) => void
  onEntityCancel: (
    id: string,
    type: string,
    value: string,
    date: string
  ) => void
}) => {
  const iAmSelected = selected == sheduledItem.id
  return (
    <div className="animate-fade-in-left" title={sheduledItem.status}>
      <div
        onClick={() => {
          if (!!PageUrls[sheduledItem.type]) {
            window.location.href = PageUrls[sheduledItem.type]
          } else {
            onClick(sheduledItem)
          }
        }}
        className={cn(
          'transition-all',
          'w-[224px] h-[192px]  flex flex-col justify-between rounded-sm py-4 px-6 cursor-pointer',
          ColorsBg[sheduledItem.type],
          'border border-transparent',
          iAmSelected && ColorsBorder[sheduledItem.type],
          ColorsHover[sheduledItem.type] && `${ColorsHover[sheduledItem.type]}`
        )}
      >
        <div className="flex flex-col gap-2">
          <div className="overflow-hidden">
            <DateHeader dateValue={sheduledItem.date} />
            <div className="flex justify-between items-center mt-2">
              <p className={cn('capitalize', iAmSelected && 'font-bold')}>
                {sheduledItem.value}
              </p>
              <div
                className={cn(
                  'h-2 w-2 rounded-full',
                  StatusColor[sheduledItem.status]
                )}
              ></div>
            </div>
            <p className="text-text-secondary text-sm">
              {sheduledItem.dateTime ? sheduledItem.dateTime : ''}
            </p>
            <p className="text-text-tertiary text-sm break-all">
              {sheduledItem.description}
            </p>
          </div>
        </div>
        {!!selected && (
          <FButton
            kind="secondary"
            size="small"
            className="w-full mt-2"
            onClick={() =>
              onEntityCancel(
                sheduledItem.id,
                sheduledItem.type,
                sheduledItem.value,
                sheduledItem.date
              )
            }
          >
            Cancel
          </FButton>
        )}
      </div>
    </div>
  )
}