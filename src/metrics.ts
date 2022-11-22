import { IMetricsComponent } from '@well-known-components/interfaces'
import { getDefaultHttpMetrics, validateMetricsDeclaration } from '@well-known-components/metrics'

export const metricDeclarations = {
  ...getDefaultHttpMetrics(),
  dcl_messaging_build_info: {
    help: 'WS room service build info.',
    type: IMetricsComponent.GaugeType,
    labelNames: ['commitHash', 'ethNetwork']
  },
  dcl_messaging_connections: {
    help: 'Number of peer connections',
    type: IMetricsComponent.GaugeType
  },
  dcl_messaging_in_messages: {
    help: 'Number of incoming messages',
    type: IMetricsComponent.CounterType
  },
  dcl_messaging_in_bytes: {
    help: 'Number of bytes from incoming messages',
    type: IMetricsComponent.CounterType
  },
  dcl_messaging_out_messages: {
    help: 'Number of outgoing messages',
    type: IMetricsComponent.CounterType
  },
  dcl_messaging_out_bytes: {
    help: 'Number of bytes from outgoing messages',
    type: IMetricsComponent.CounterType
  },
  dcl_messaging_ws_buffed_amount: {
    help: 'Buffered ammount for a ws',
    type: IMetricsComponent.GaugeType,
    labelNames: ['alias']
  }
}

// type assertions
validateMetricsDeclaration(metricDeclarations)
