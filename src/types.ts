import { HTTPProvider } from 'eth-connect'
import type { IFetchComponent } from '@well-known-components/http-server'
import type {
  IConfigComponent,
  ILoggerComponent,
  IHttpServerComponent,
  IMetricsComponent
} from '@well-known-components/interfaces'
import { metricDeclarations } from './metrics'
import * as uWS from 'uWebSockets.js'
import { Emitter } from 'mitt'
import { INatsComponent } from '@well-known-components/nats-component/dist/types'

export type GlobalContext = {
  app: uWS.TemplatedApp
  components: BaseComponents
}

// components used in every environment
export type BaseComponents = {
  config: IConfigComponent
  logs: ILoggerComponent
  fetch: IFetchComponent
  metrics: IMetricsComponent<keyof typeof metricDeclarations>
  ethereumProvider: HTTPProvider
  nats: INatsComponent
}

// components used in runtime
export type AppComponents = BaseComponents

// components used in tests
export type TestComponents = BaseComponents & {
  // A fetch component that only hits the test server
  localFetch: IFetchComponent
}

export type IWsTestComponent = {
  createWs(relativeUrl: string): WebSocket
}

// this type simplifies the typings of http handlers
export type HandlerContextWithPath<
  ComponentNames extends keyof AppComponents,
  Path extends string = any
> = IHttpServerComponent.PathAwareContext<
  IHttpServerComponent.DefaultContext<{
    components: Pick<AppComponents, ComponentNames>
  }>,
  Path
>

export type Context<Path extends string = any> = IHttpServerComponent.PathAwareContext<GlobalContext, Path>

export enum Stage {
  LINEAR,
  READY
}

export type WsEvents = {
  message: any
  error: any
  close: any
}

export type WebSocketReader = Pick<uWS.WebSocket, 'end' | 'close'> & Emitter<WsEvents>

export type WebSocket = Pick<uWS.WebSocket, 'subscribe' | 'unsubscribe' | 'send' | 'publish'> &
  WebSocketReader & {
    stage: Stage
    alias: number
    address?: string
  }
