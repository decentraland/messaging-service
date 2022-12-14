import { HTTPProvider } from 'eth-connect'
import { createDotEnvConfigComponent } from '@well-known-components/env-config-provider'
import { createLogComponent } from '@well-known-components/logger'
import { createFetchComponent } from './adapters/fetch'
import { createMetricsComponent } from '@well-known-components/metrics'
import { AppComponents } from './types'
import { metricDeclarations } from './metrics'
import { observeBuildInfo } from './logic/build-info'
import { createNatsComponent } from '@well-known-components/nats-component'

const DEFAULT_ETH_NETWORK = 'goerli'

// Initialize all the components of the app
export async function initComponents(): Promise<AppComponents> {
  const config = await createDotEnvConfigComponent({ path: ['.env.default', '.env'] })

  const ethNetwork = (await config.getString('ETH_NETWORK')) ?? DEFAULT_ETH_NETWORK

  const logs = await createLogComponent({})
  const fetch = await createFetchComponent()
  const metrics = await createMetricsComponent(metricDeclarations, { config })
  const ethereumProvider = new HTTPProvider(
    `https://rpc.decentraland.org/${encodeURIComponent(ethNetwork)}?project=mini-comms`,
    { fetch: fetch.fetch }
  )

  const nats = await createNatsComponent({ config, logs })
  await observeBuildInfo({ config, metrics })
  return {
    config,
    logs,
    fetch,
    metrics,
    ethereumProvider,
    nats
  }
}
