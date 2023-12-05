import path from 'path'
import Bottleneck from 'bottleneck'
import { FastifyPluginCallback, FastifyRequest } from 'fastify'
import nodeCron from 'node-cron'
import { SESSION_TOKEN_COOKIE_NAME } from '#server/constants'
import { appConfig, AppConfig } from '#server/app-config'
import config from '#server/config'
import { sequelize } from '#server/db'
import { safeRequire, getFilePath } from '#server/utils'
import {
  CronJobContext,
  ModuleCronJobsFactory,
  ConnectedModels,
  ConnectedIntegrations,
} from '#server/types'
import { DefaultPermissionPostfix } from '#shared/types'
import { PermissionsSet } from '#shared/utils'
import * as fp from '#shared/utils/fp'

const safeRequireDist = (relativePath: string) =>
  safeRequire(getFilePath(`dist_server/${relativePath}`))

export const moduleRouterPlugin =
  (): FastifyPluginCallback => async (fastify, opts) => {
    // initialise integrations
    const integrations = await initialiseIntegrations()
    // register webhooks router for each integration
    for (const appIntegration of appConfig.integrations) {
      try {
        const integrationRouter =
          safeRequireDist(`src/integrations/${appIntegration.id}/router`) || {}
        if (integrationRouter.webhookRouter) {
          fastify.register(integrationRouter.webhookRouter, {
            prefix: `/integrations/${appIntegration.id}/webhooks/`,
          })
        }
      } catch (err) {
        console.log(`The "${appIntegration.id}" has no webhooks router...`)
      }
    }

    const cachedModels = new Map()

    const limiter = new Bottleneck({
      minTime: 1000,
      maxConcurrent: 1,
    })
    for (const module of appConfig.modules) {
      if (!module) continue

      const moduleManifest = module.manifest
      const distPath = module.buildProps.custom
        ? 'config/modules'
        : 'src/modules'
      const moduleRouters =
        safeRequireDist(`${distPath}/${module.id}/server/router`) || {}
      const moduleModels =
        safeRequireDist(`${distPath}/${module.id}/server/models`) || {}
      const moduleCronJobs = safeRequireDist(
        `${distPath}/${module.id}/server/jobs`
      )

      fastify.register(async (fastify) => {
        // decorate "db"
        const models: Record<string, any> = {}
        for (const modelId of moduleManifest.models || []) {
          const model = moduleModels[modelId]
          if (model) {
            cachedModels.set(modelId, model)
            models[modelId] = model
          } else {
            throw new Error(
              `Missing "${modelId}" model for "${module.id}" module`
            )
          }
        }
        for (const dependencyModuleId of moduleManifest.dependencies || []) {
          const dependencyModule = appConfig.modules.find(
            fp.propEq('id', dependencyModuleId)
          )
          if (!dependencyModule) continue
          for (const dependencyModel of dependencyModule.manifest.models ||
            []) {
            if (!models[dependencyModel]) {
              models[dependencyModel] = cachedModels.get(dependencyModel)
            }
          }
        }
        fastify.decorate('db', models as ConnectedModels)

        let moduleIntegrations = {}
        // decorate "integrations"
        if (module.enabledIntegrations) {
          moduleIntegrations = module.enabledIntegrations.reduce((acc, x) => {
            const integration = integrations[x]
            return { ...acc, [integration.name]: integration.instance }
          }, {})
          fastify.decorate(
            'integrations',
            moduleIntegrations as ConnectedIntegrations
          )
        }

        // decorate "user", "permissions", ...
        fastify.decorateRequest('user', null)
        fastify.addHook(
          'onRequest',
          async (
            req: FastifyRequest<{ Querystring: { office?: string } }>,
            reply
          ) => {
            req.permissions = new PermissionsSet([])
            const token = req.cookies[SESSION_TOKEN_COOKIE_NAME]
            if (token && fastify.db.Session && fastify.db.User) {
              // const { id } = await jwt.verify(token)
              const session = await fastify.db.Session.findOne({
                where: { token },
              })
              if (session) {
                const user = await fastify.db.User.findOneActive({
                  where: { id: session.userId },
                })
                if (user) {
                  req.user = user
                  req.permissions = appConfig.getUserPermissions(
                    user.email,
                    user.getAuthAddresses(),
                    user.role
                  )
                }
              }
            }
            req.can = (permission: string) => {
              return req.permissions.has(permission)
            }
            req.check = (...permissions: string[]) => {
              if (!req.permissions.hasAll(permissions)) {
                reply.status(403)
                throw new Error('Access denied')
              }
            }
            const officeId = req.query.office
            if (officeId) {
              req.office = appConfig.getOfficeById(officeId)
            }
          }
        )

        // register public router
        if (moduleRouters.publicRouter) {
          fastify.register(moduleRouters.publicRouter, {
            prefix: `/public-api/${module.id}/`,
          })
        }

        // register private routers
        if (moduleRouters.userRouter || moduleRouters.adminRouter) {
          fastify.register(async (fastify) => {
            fastify.addHook('onRequest', async (req, reply) => {
              if (!req.user) {
                return reply.throw.authException('Unauthenticated')
              }
            })
            if (moduleRouters.userRouter) {
              fastify.register(moduleRouters.userRouter, {
                prefix: `/user-api/${module.id}/`,
              })
            }
            if (moduleRouters.adminRouter) {
              fastify.register(async (fastify) => {
                fastify.addHook('onRequest', async (req, reply) => {
                  if (
                    !req.can(`${module.id}.${DefaultPermissionPostfix.Admin}`)
                  ) {
                    return reply.throw.accessDenied()
                  }
                })
                fastify.register(moduleRouters.adminRouter, {
                  prefix: `/admin-api/${module.id}/`,
                })
              })
            }
          })
        }

        // register cron jobs
        // TODO: define active jobs in the config/modules.json file
        if (!config.skipCronJobs && moduleCronJobs) {
          const { moduleCronJobsFactory } = moduleCronJobs as {
            moduleCronJobsFactory: ModuleCronJobsFactory
          }
          const jobContext: CronJobContext = {
            models: models as CronJobContext['models'],
            integrations: moduleIntegrations as CronJobContext['integrations'],
            log: fastify.log, // TODO: wrap logger with prefixed module name and job name
            appConfig,
            sequelize,
          }
          const moduleJobs = moduleCronJobsFactory(jobContext)
          moduleJobs.forEach((job) => {
            fastify.log.info(
              `Job "${job.name}" has been scheduled for "${job.cron}" ("${module.id}" module)`
            )
            nodeCron.schedule(job.cron, () => {
              limiter.schedule(async () => {
                try {
                  await fastify.log.info(`Job "${job.name}" started`)
                  await job.fn(jobContext)
                  await fastify.log.info(`Job "${job.name}" finished`)
                } catch (err) {
                  fastify.log.error(
                    err,
                    `Error occurred during execution of scheduled job "${job.name}" `
                  )
                }
              })
            })
          })
        }
      })
    }

    fastify.decorate('sequelize', sequelize)
  }

const initialiseIntegrations = async (): Promise<
  Record<string, { name: string; instance: any }>
> => {
  const integrationById: Record<string, { name: string; instance: any }> = {}
  for (const appIntegration of appConfig.integrations) {
    const { default: Integration } = require(getFilePath(
      `dist_server/src/integrations/${appIntegration.id}`
    ))
    const integration = new Integration()
    integration.init()
    integrationById[appIntegration.id] = {
      name: appIntegration.name,
      instance: integration,
    }
  }
  return integrationById
}
