import { randomBytes } from 'crypto'
import { Op, QueryTypes, col, fn } from 'sequelize'
import dayjs from 'dayjs'
import { FastifyPluginCallback, FastifyRequest } from 'fastify'
import { appConfig } from '#server/app-config'
import config from '#server/config'
import { DATE_FORMAT, ROBOT_USER_ID } from '#server/constants'
import * as fp from '#shared/utils/fp'
import {
  formatVisitDates,
  generateVisits,
  updateVisitsForManualInvite,
} from './helpers'
import {
  GuestInviteGuestRequest,
  GuestInviteRequest,
  GuestInviteStatus,
  GuestInviteUpdateRequest,
  GuestInvitesAdminDashboardStats,
} from '../types'
import { Permissions } from '../permissions'
import { GuestInvite } from './models'
import { Metadata } from '../metadata-schema'

const mId = 'guest-invites'

const generateInviteCode = (): Promise<string> =>
  new Promise((resolve, reject) => {
    randomBytes(32, (err, buf) => {
      if (err) {
        reject(err)
      }
      resolve(buf.toString('hex'))
    })
  })

const publicRouter: FastifyPluginCallback = async function (fastify, opts) {
  fastify.get(
    '/invite/:code',
    async (req: FastifyRequest<{ Params: { code: string } }>, reply) => {
      if (!req.params.code) {
        return reply.throw.badParams('Missing invitation code')
      }
      const invite = await fastify.db.GuestInvite.findOne({
        where: { code: req.params.code },
      })
      if (!invite || invite.status !== 'pending') {
        return reply.throw.rejected('Invalid invitation code')
      }

      return invite.usePublicGuestInviteView()
    }
  )

  fastify.get(
    '/invite/:code/rules',
    async (req: FastifyRequest<{ Params: { code: string } }>, reply) => {
      if (!req.params.code) {
        return reply.throw.badParams('Missing invitation code')
      }
      const invite = await fastify.db.GuestInvite.findOne({
        where: { code: req.params.code },
      })
      if (!invite || invite.status !== 'pending') {
        return reply.throw.rejected('Invalid invitation code')
      }

      const metadata = appConfig.getModuleMetadata('guest-invites') as Metadata
      const rulesByOffice = metadata.rulesByOffice
      if (rulesByOffice) {
        return rulesByOffice[invite.office] || rulesByOffice['__default']
      }
      return []
    }
  )

  fastify.post(
    '/invite/:code',
    async (
      req: FastifyRequest<{
        Params: { code: string }
        Body: GuestInviteGuestRequest
      }>,
      reply
    ) => {
      if (!req.params.code) {
        return reply.throw.badParams('Missing invitation code')
      }
      const invite = await fastify.db.GuestInvite.findOne({
        where: { code: req.params.code },
      })
      if (!invite || invite.status !== 'pending') {
        return reply.throw.rejected('Invalid invitation code')
      }

      // Update invite
      await invite
        .set({
          status: 'opened',
          fullName: req.body.fullName,
          dates: req.body.dates.sort((a, b) => dayjs(a).diff(dayjs(b))),
        })
        .save()

      // Send Matrix notification for admins
      if (fastify.integrations.Matrix) {
        const inviter = await fastify.db.User.findByPkActive(
          invite.creatorUserId
        )
        const message = appConfig.templates.notification(
          mId,
          'openedGuestInviteAdmin',
          {
            visitDates: formatVisitDates(invite.dates),
            guest: {
              fullName: invite.fullName,
              email: invite.email,
            },
            office: appConfig.getOfficeById(invite.office),
            user: inviter?.usePublicProfileView(),
          }
        )
        if (message) {
          fastify.integrations.Matrix.sendMessageInAdminRoomDeferred(message)
        }
      }
      return reply.ok()
    }
  )
}

const userRouter: FastifyPluginCallback = async function (fastify, opts) {
  fastify.get(
    '/invite/:inviteId',
    async (req: FastifyRequest<{ Params: { inviteId: string } }>, reply) => {
      if (!req.params.inviteId) {
        return reply.throw.badParams('Missing invitation id')
      }
      const invite = await fastify.db.GuestInvite.findByPk(req.params.inviteId)
      if (!invite) {
        return reply.throw.notFound()
      }
      if (invite.creatorUserId !== req.user.id) {
        req.check(Permissions.AdminList, invite.office)
      } else {
        req.check(Permissions.Create, invite.office)
      }
      return invite
    }
  )

  fastify.post(
    '/invite',
    async (req: FastifyRequest<{ Body: GuestInviteRequest }>, reply) => {
      if (!req.office) {
        return reply.throw.badParams('Invalid office ID')
      }
      req.check(Permissions.Create, req.office.id)

      const email = req.body.email.trim().toLowerCase()

      // Check duplicates
      const existingInvite = await fastify.db.GuestInvite.findOne({
        where: { status: 'pending', email, office: req.office.id },
      })
      if (existingInvite) {
        return reply.throw.rejected(
          'A user with this email already has an invitation'
        )
      }

      // Create invite
      const code = await generateInviteCode()
      await fastify.db.GuestInvite.create({
        code,
        email,
        fullName: req.body.fullName,
        creatorUserId: req.user.id,
        status: 'pending',
        office: req.office.id,
      })

      // Guest email notification
      if (fastify.integrations.EmailSMTP) {
        const emailMessage = appConfig.templates.email(mId, 'newInvitation', {
          guest: {
            fullName: req.body.fullName,
          },
          office: req?.office,
          companyName: appConfig.config.company.name,
          formUrl: `${config.appHost}/guest-invite/${code}`,
        })
        if (emailMessage?.html) {
          fastify.integrations.EmailSMTP.sendEmailDeferred({
            to: email,
            html: emailMessage.html,
            subject: emailMessage.subject ?? '',
          })
        }
      }

      // Matrix admin notification
      if (fastify.integrations.Matrix) {
        const message = appConfig.templates.notification(
          mId,
          'newGuestInviteAdmin',
          {
            user: req.user.usePublicProfileView(),
            guest: {
              fullName: req.body.fullName,
              email,
            },
            office: req.office,
          }
        )
        if (message) {
          fastify.integrations.Matrix.sendMessageInAdminRoomDeferred(message)
        }
      }
    }
  )

  fastify.put(
    '/:guestInviteId',
    async (
      req: FastifyRequest<{
        Params: { guestInviteId: string }
        Body: { status: GuestInviteStatus }
      }>,
      reply
    ) => {
      const status = req.body.status
      const invite = await fastify.db.GuestInvite.findOne({
        where: {
          id: req.params.guestInviteId,
          creatorUserId: req.user.id,
        },
      })
      if (!invite) {
        return reply.throw.notFound()
      }
      req.check(Permissions.Create, invite.office)

      if (
        invite.status !== 'confirmed' &&
        req.body.status !== ('cancelled' as GuestInviteStatus)
      ) {
        return reply.throw.rejected()
      }

      await invite.set({ status }).save()

      const office = appConfig.getOfficeById(invite.office)
      // Send user notification to the user via Matrix
      if (fastify.integrations.Matrix) {
        const visitDates = formatVisitDates(invite.dates)
        const message = appConfig.templates.notification(
          mId,
          'invitationCancelledByUser',
          {
            status,
            guest: { fullName: invite.fullName },
            visitDates,
            office,
          }
        )
        if (message) {
          fastify.integrations.Matrix.sendMessageToUserDeferred(
            req.user,
            message
          )
        }

        const adminMessage = appConfig.templates.notification(
          mId,
          'invitationCancelledbyUserForAdmin',
          {
            status,
            guest: { fullName: invite.fullName },
            user: req.user.usePublicProfileView(),
            visitDates,
            office,
          }
        )
        if (adminMessage) {
          fastify.integrations.Matrix.sendMessageInAdminRoomDeferred(
            adminMessage
          )
        }
      }

      if (fastify.integrations.EmailSMTP) {
        const emailMessage = appConfig.templates.email(
          mId,
          'invitationCancelledByUser',
          {
            guest: {
              fullName: invite.fullName,
            },
            office,
            visitDates: formatVisitDates(invite.dates, 'D MMMM YYYY'),
            companyName: appConfig.config.company.name,
          }
        )
        if (emailMessage?.html) {
          fastify.integrations.EmailSMTP.sendEmailDeferred({
            to: invite.email,
            subject: emailMessage.subject ?? '',
            html: emailMessage.html,
          })
        }
      }
      return reply.ok()
    }
  )
}

const adminRouter: FastifyPluginCallback = async function (fastify, opts) {
  fastify.get('/invite', async (req, reply) => {
    if (!req.office) {
      return reply.throw.badParams('Invalid office ID')
    }
    req.check(Permissions.AdminList, req.office.id)
    const invites = await fastify.db.GuestInvite.findAll({
      where: { office: req.office.id },
      order: [['createdAt', 'DESC']],
    })
    return invites
  })

  fastify.get(
    '/invite/:inviteId',
    async (req: FastifyRequest<{ Params: { inviteId: string } }>, reply) => {
      if (!req.params.inviteId) {
        return reply.throw.badParams('Missing invite ID')
      }
      const invite = await fastify.db.GuestInvite.findByPk(req.params.inviteId)
      if (!invite) {
        return reply.throw.notFound()
      }
      req.check(Permissions.AdminList, invite.office)
      return invite
    }
  )

  fastify.put(
    '/invite/:inviteId',
    async (
      req: FastifyRequest<{
        Params: { inviteId: string }
        Body: GuestInviteUpdateRequest
      }>,
      reply
    ) => {
      const invite = await fastify.db.GuestInvite.findByPk(req.params.inviteId)
      if (!invite) {
        return reply.throw.notFound()
      }
      req.check(Permissions.AdminManage, invite.office)
      const { status, areaId, deskId } = req.body

      if (invite.code === 'manual') {
        const data = req.body as GuestInvite
        try {
          await fastify.sequelize.transaction(async (t) => {
            const dates = data.dates.sort((a, b) => dayjs(a).diff(dayjs(b)))
            await updateVisitsForManualInvite(
              fastify,
              t,
              invite,
              data.areaId,
              data.deskId,
              dates,
              status
            )
            await invite
              .set({
                fullName: data.fullName,
                email: data.email,
                dates: dates,
                deskId: data.deskId,
                areaId: data.areaId,
                status: data.status,
              })
              .save({ transaction: t })
          })
        } catch (err) {
          req.log.error(`Failed manual guest invite update`)
          req.log.error(err)
          return reply.throw.internalError("The guest invite can't be updated")
        }

        return reply.ok()
      }

      if (invite.status === 'pending' && status === 'rejected') {
        // Remove an invite
        await invite.destroy()
        // appEvents.useModule('admin').emit('update_counters')
        return reply.ok()
      }
      if (invite.status === 'opened' && status === 'rejected') {
        // Reject guest invite
        await invite.set({ status: 'rejected' }).save()
        // appEvents.useModule('admin').emit('update_counters')
        return reply.ok()
      }
      if (invite.status === 'opened' && status === 'confirmed') {
        if (!areaId || !deskId) {
          return reply.throw.badParams('Missing area/desk ID')
        }

        try {
          await fastify.sequelize.transaction(async (t) => {
            // Confirm guest invite
            await invite
              .set({
                status: 'confirmed',
                areaId,
                deskId,
              })
              .save({ transaction: t })

            // Create user
            let user = await fastify.db.User.findOneActive({
              where: { email: invite.email },
              transaction: t,
            })
            if (!user) {
              user = await fastify.db.User.create(
                {
                  email: invite.email,
                  fullName: invite.fullName,
                  roles: [appConfig.getDefaultUserRoleByEmail(invite.email)],
                },
                { transaction: t }
              )
            }

            // Create visit
            const visits = generateVisits(
              areaId,
              deskId,
              invite.dates,
              invite,
              user.id,
              user.fullName || invite.fullName
            )
            // @ts-ignore FIXME:
            await fastify.db.Visit.bulkCreate(visits, { transaction: t })

            // Send guest email
            if (fastify.integrations.EmailSMTP) {
              const office = appConfig.getOfficeById(invite.office)
              const emailMessage = appConfig.templates.email(
                mId,
                'invitationConfirmedByAdmin',
                {
                  guest: {
                    fullName: invite.fullName,
                  },
                  office,
                  visitDates: formatVisitDates(invite.dates, 'D MMMM YYYY'),
                  companyName: appConfig.config.company.name,
                }
              )
              if (emailMessage?.html) {
                fastify.integrations.EmailSMTP.sendEmailDeferred({
                  to: invite.email,
                  subject: emailMessage.subject ?? '',
                  html: emailMessage.html,
                })
              }
            }

            // Send admin Matrix notification
            if (fastify.integrations.Matrix) {
              const admin = await fastify.db.User.findByPkActive(req.user.id)
              const office = appConfig.getOfficeById(invite.office)
              const area = office.areas!.find((x) => x.id === areaId)
              const desk = area?.desks.find((x) => x.id === deskId)
              const message = appConfig.templates.notification(
                mId,
                'invitationConfirmedByAdmin',
                {
                  admin,
                  guest: {
                    fullName: invite.fullName,
                    email: invite.email,
                  },
                  visitDates: formatVisitDates(invite.dates),
                  areaName: area?.name || areaId,
                  deskName: desk?.name || deskId,
                  office,
                }
              )
              if (message) {
                fastify.integrations.Matrix.sendMessageInAdminRoomDeferred(
                  message
                )
              }
            }
          })
          // appEvents.useModule('admin').emit('update_counters')
        } catch (err) {
          req.log.error(`Failed guest invite confirmation`, err)
          return reply.throw.internalError(
            "The guest invite can't be confirmed"
          )
        }

        return reply.ok()
      }
      return reply.throw.rejected("The update can't be applied")
    }
  )
  fastify.post(
    '/invite',
    async (req: FastifyRequest<{ Body: GuestInvite }>, reply) => {
      req.check(Permissions.Create)

      if (!req.office) {
        return reply.throw.badParams('Invalid office ID')
      }

      const email = req.body.email.trim().toLowerCase()
      const dates = req.body.dates.map((d) => dayjs(d).format(DATE_FORMAT))
      // Create invite

      const data = req.body as GuestInvite
      try {
        await fastify.sequelize.transaction(async (t) => {
          const invite = await fastify.db.GuestInvite.create({
            code: 'manual',
            email,
            fullName: data.fullName,
            creatorUserId: req.user.id,
            status: 'confirmed',
            office: req.office?.id ?? '',
            areaId: data.areaId,
            deskId: data.deskId,
            dates: dates,
          })
          // Create visit
          if (data.areaId && data.deskId) {
            const visits = generateVisits(
              data.areaId,
              data.deskId,
              dates,
              invite,
              ROBOT_USER_ID,
              data.fullName
            )
            // @ts-ignore FIXME:
            await fastify.db.Visit.bulkCreate(visits, { transaction: t })
          }
        })
      } catch (err) {
        req.log.error(`Failed guest invite creation`)
        req.log.error(err)
        return reply.throw.internalError("The guest invite can't be created")
      }
    }
  )

  fastify.get(
    '/admin-dashboard-stats',
    async (
      req: FastifyRequest<{
        Querystring: { startDate: string; endDate: string }
      }>,
      reply
    ) => {
      req.check(Permissions.AdminList)
      const office = req.office
      if (!office) {
        return reply.throw.badParams('Missing office ID')
      }
      const { startDate, endDate } = req.query

      const result: GuestInvitesAdminDashboardStats = {
        guestsTotal: 0,
        guestsToday: 0,
        topGuests: [],
        topInviters: [],
        guestsByDate: [],
      }

      result.guestsTotal = await fastify.db.Visit.count({
        where: {
          officeId: office.id,
          'metadata.guestInvite': true,
          date: {
            [Op.gte]: startDate,
            [Op.lte]: endDate,
          },
        },
      })

      result.guestsToday = await fastify.db.Visit.count({
        where: {
          officeId: office.id,
          'metadata.guestInvite': true,
          date: {
            [Op.gte]: dayjs().startOf('day').toDate(),
            [Op.lte]: dayjs().endOf('day').toDate(),
          },
        },
      })

      result.topGuests = (await fastify.db.Visit.findAll({
        where: {
          'metadata.guestInvite': true,
          officeId: office.id,
          date: {
            [Op.gte]: startDate,
            [Op.lte]: endDate,
          },
        },
        attributes: ['userId', [fn('COUNT', col('userId')), 'visits']],
        group: ['userId'],
        order: [[fn('COUNT', col('userId')), 'DESC']],
        limit: 10,
        raw: true,
      })) as unknown as GuestInvitesAdminDashboardStats['topGuests']

      let userIds = result.topGuests.map(fp.prop('userId'))

      result.topInviters = (await fastify.db.GuestInvite.findAll({
        where: {
          office: office.id,
          status: 'confirmed',
          createdAt: {
            [Op.gte]: startDate,
            [Op.lte]: endDate,
          },
        },
        attributes: [
          ['creatorUserId', 'userId'],
          [fn('COUNT', col('creatorUserId')), 'guests'],
        ],
        group: ['creatorUserId'],
        order: [[fn('COUNT', col('creatorUserId')), 'DESC']],
        limit: 10,
        raw: true,
      })) as unknown as GuestInvitesAdminDashboardStats['topInviters']

      userIds = userIds.concat(result.topInviters.map(fp.prop('userId')))
      const uniqueUserIds = Array.from(new Set(userIds))
      const users = await fastify.db.User.findAll({
        where: {
          id: { [Op.in]: uniqueUserIds },
        },
        attributes: ['id', 'fullName', 'avatar'],
      })
      const userById = users.reduce(fp.by('id'), {})

      result.topGuests = result.topGuests.map((x) => {
        const user = userById[x.userId]
        return {
          ...x,
          fullName: user.fullName,
          avatar: user.avatar,
        }
      })
      result.topInviters = result.topInviters.map((x) => {
        const user = userById[x.userId]
        return {
          ...x,
          fullName: user.fullName,
          avatar: user.avatar,
        }
      })

      const dateFormat =
        dayjs(endDate, DATE_FORMAT).diff(
          dayjs(startDate, DATE_FORMAT),
          'days'
        ) > 31
          ? 'YYYY-MM'
          : 'YYYY-MM-DD'

      result.guestsByDate = (await fastify.sequelize.query(
        `
          SELECT
            to_char(v."date", :dateFormat) AS date,
            cast(COUNT(*) as integer) AS total
          FROM
            visits v
          WHERE
            1=1
            AND v."officeId" = :officeId
            AND v."date" BETWEEN :startDate AND :endDate
            AND v."metadata"->>'guestInvite' = 'true'
          GROUP BY
            to_char(v."date", :dateFormat)
          ORDER BY
            date ASC;
        `,
        {
          replacements: { dateFormat, startDate, endDate, officeId: office.id },
          type: QueryTypes.SELECT,
        }
      )) as unknown as GuestInvitesAdminDashboardStats['guestsByDate']

      return result
    }
  )

  fastify.get('/counter', async (req, reply) => {
    if (!req.office) {
      return reply.throw.badParams('Missing office ID')
    }
    req.check(Permissions.AdminList, req.office.id)
    return fastify.db.GuestInvite.count({
      where: {
        office: req.office.id,
        status: 'opened',
      },
    })
  })
}

module.exports = {
  publicRouter,
  userRouter,
  adminRouter,
}
