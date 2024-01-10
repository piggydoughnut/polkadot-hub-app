import { DATE_FORMAT, ROBOT_USER_ID } from '#server/constants'
import dayjs from 'dayjs'
import { FastifyInstance } from 'fastify'
import { GuestInvite } from '../models'
import { Transaction } from 'sequelize'

export const formatVisitDates = (dates: string[], format: string = 'D MMM') =>
  dates.map((x: string) => ({
    date: dayjs(x, DATE_FORMAT).format(format),
  }))

// can be moved to a shared helper in a more general form
export const compareDates = (
  existing: Array<string>,
  newDates: Array<string>
) =>
  existing.length === newDates.length &&
  existing.every((value, index) => value === newDates[index])

export const updateVisitsForManualInvite = async (
  fastify: FastifyInstance,
  transaction: Transaction,
  invite: GuestInvite,
  areaId: string | null,
  deskId: string | null,
  dates: Array<string>
) => {
  // Need to cancel any office visits dates which were removed
  const datesAreTheSame: boolean = compareDates(invite.dates, dates)

  let datesToSchedule: Array<string> = []

  if (!datesAreTheSame) {
    datesToSchedule = dates.filter((date) => !invite.dates.includes(date))
    const datesToCancel: Array<string> = invite.dates.filter(
      (date) => !dates.includes(date)
    )

    // cancelling all the office visit dates that were removed from the guest invite
    if (!!datesToCancel.length) {
      for (const visitDate of datesToCancel) {
        const v = await fastify.db.Visit.findOne({
          where: {
            date: visitDate,
            deskId,
            areaId,
            userId: ROBOT_USER_ID,
            officeId: invite.office,
          },
          transaction,
        })
        await v.destroy({ transaction: transaction })
      }
    }
  }

  // scheduling all the new visit dates that were added to the guest invite
  if (!!datesToSchedule.length) {
    const visits = generateVisits(
      areaId,
      deskId,
      datesToSchedule,
      invite,
      ROBOT_USER_ID
    )
    // @ts-ignore FIXME:
    await fastify.db.Visit.bulkCreate(visits, { transaction })
  }
}

export const generateVisits = (
  areaId: string,
  deskId: string,
  datesToSchedule: Array<string>,
  invite: GuestInvite,
  userId: string
) => {
  // Create visit
  const visits = []
  for (const date of datesToSchedule) {
    visits.push({
      userId,
      date: dayjs(date, DATE_FORMAT).toDate(),
      officeId: invite.office,
      areaId,
      deskId,
      metadata: {
        guestInvite: true, // TODO: delete?
        guestInviteId: invite.id,
      },
      status: 'confirmed',
    })
  }
  return visits
}
