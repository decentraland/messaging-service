import mitt from 'mitt'
import * as uWS from 'uWebSockets.js'
import { GlobalContext, WebSocket, Stage } from '../types'
import { handleSocketLinearProtocol } from '../logic/handle-linear-protocol'
import { craftMessage } from '../logic/craft-message'
import { ClientMessage, IslandChangedMessage, JoinIslandMessage, LeftIslandMessage } from '../proto/messaging.gen'
import { NatsMsg } from '@well-known-components/nats-component/dist/types'
import {
  ArchipelagoIslandChangedMessage,
  ArchipelagoJoinIslandMessage,
  ArchipelagoLeftIslandMessage
} from '../proto/archipelago.gen'
import { Position } from '../proto/decentraland/common/vectors.gen'

// the message topics for this service are prefixed to prevent
// users "hacking" the NATS messages
export const saltedPrefix = 'client-proto.'
export const peerPrefix = `${saltedPrefix}peer.`

export async function setupRouter({ app, components }: GlobalContext): Promise<void> {
  const { logs, metrics, config, nats } = components
  const logger = logs.getLogger('messaging')

  const commitHash = await config.getString('COMMIT_HASH')
  const status = JSON.stringify({ commitHash })

  let connectionIndex = 1
  const addressToAlias = new Map<string, number>()

  function relayToSubscriptors(subject: string, payload: Uint8Array) {
    const topic = subject.substring(saltedPrefix.length)
    const subscriptionMessage = craftMessage({
      message: {
        $case: 'subscriptionMessage',
        subscriptionMessage: {
          sender: 0,
          topic: topic,
          body: payload
        }
      }
    })

    app.publish(topic, subscriptionMessage, true)
  }
  nats.subscribe(`${saltedPrefix}*.island_changed`, (err: Error | null, message: NatsMsg) => {
    if (err) {
      logger.error(err)
      return
    }

    const archipelagoIslandChange = ArchipelagoIslandChangedMessage.decode(message.data)
    const { islandId, connStr, fromIslandId } = archipelagoIslandChange

    const peers: { [key: number]: Position } = {}
    for (const [address, p] of Object.entries(archipelagoIslandChange.peers)) {
      const alias = addressToAlias.get(address)
      if (alias) {
        peers[alias] = p
      }
    }

    const islandChange = IslandChangedMessage.encode({
      islandId,
      connStr,
      fromIslandId,
      peers
    }).finish()

    relayToSubscriptors(message.subject, islandChange)
  })
  nats.subscribe(`${saltedPrefix}island.*.peer_join`, (err: Error | null, message: NatsMsg) => {
    if (err) {
      logger.error(err)
      return
    }

    const { islandId, peerId } = ArchipelagoJoinIslandMessage.decode(message.data)

    const alias = addressToAlias.get(peerId)
    if (!alias) {
      return
    }

    relayToSubscriptors(
      message.subject,
      JoinIslandMessage.encode({
        islandId,
        peerId: alias
      }).finish()
    )
  })
  nats.subscribe(`${saltedPrefix}island.*.peer_left`, (err: Error | null, message: NatsMsg) => {
    if (err) {
      logger.error(err)
      return
    }

    const { islandId, peerId } = ArchipelagoLeftIslandMessage.decode(message.data)
    logger.debug(`peer left: ${islandId}:${peerId}`)

    const alias = addressToAlias.get(peerId)
    if (!alias) {
      return
    }

    logger.debug(`peer left: ${islandId}:${alias}`)
    relayToSubscriptors(
      message.subject,
      LeftIslandMessage.encode({
        islandId,
        peerId: alias
      }).finish()
    )
  })

  app
    .get('/status', async (res) => {
      res.end(status)
    })
    .get('/metrics', async (res) => {
      const body = await (metrics as any).registry.metrics()
      res.end(body)
    })
    .ws('/service', {
      compression: uWS.DISABLED,
      idleTimeout: 0,
      upgrade: (res, req, context) => {
        res.upgrade(
          {
            // NOTE: this is user data
            url: req.getUrl(),
            ...mitt()
          },
          /* Spell these correctly */
          req.getHeader('sec-websocket-key'),
          req.getHeader('sec-websocket-protocol'),
          req.getHeader('sec-websocket-extensions'),
          context
        )
      },
      open: (_ws) => {
        components.metrics.increment('dcl_messaging_connections', {})
        const ws = _ws as any as WebSocket
        ws.stage = Stage.LINEAR
        handleSocketLinearProtocol(components, ws)
          .then(() => {
            ws.alias = addressToAlias.get(ws.address!) || connectionIndex++
            const welcomeMessage = craftMessage({
              message: {
                $case: 'welcome',
                welcome: { alias: ws.alias }
              }
            })
            if (ws.send(welcomeMessage, true) !== 1) {
              logger.error('Closing connection: cannot send welcome')
              ws.close()
              return
            }

            logger.debug(`Welcome sent`, { address: ws.address!, alias: ws.alias })

            ws.stage = Stage.READY
            nats.publish(`peer.${ws.address!}.connect`)
            addressToAlias.set(ws.address!, ws.alias)
          })
          .catch((err: any) => {
            logger.error(err)
            try {
              ws.close()
            } catch (err: any) {
              logger.error(err)
            }
          })
      },
      drain: (ws) => {
        components.metrics.observe('dcl_messaging_ws_buffered_amount', { alias: ws.alias }, ws.getBufferedAmount())
      },
      message: (_ws, data, isBinary) => {
        if (!isBinary) {
          logger.log('protocol error: data is not binary')
          return
        }

        const ws = _ws as any as WebSocket

        metrics.increment('dcl_messaging_in_messages', {})
        metrics.increment('dcl_messaging_in_bytes', {}, data.byteLength)

        switch (ws.stage) {
          case Stage.LINEAR: {
            _ws.emit('message', Buffer.from(data))
            break
          }
          case Stage.READY: {
            const { message } = ClientMessage.decode(Buffer.from(data))
            if (!message) {
              return
            }
            switch (message.$case) {
              case 'heartbeat': {
                const realTopic = `${peerPrefix}${ws.address!}.heartbeat`
                nats.publish(realTopic, Buffer.from(message.heartbeat))
                break
              }
              case 'publishRequest': {
                const {
                  publishRequest: { topics, payload }
                } = message

                for (const topic of topics) {
                  const subscriptionMessage = craftMessage({
                    message: {
                      $case: 'subscriptionMessage',
                      subscriptionMessage: {
                        sender: ws.alias,
                        topic: topic,
                        body: payload
                      }
                    }
                  })

                  const n = app.numSubscribers(topic)
                  metrics.increment('dcl_messaging_out_messages', {}, n)
                  metrics.increment('dcl_messaging_out_bytes', {}, subscriptionMessage.byteLength * n)
                  app.publish(topic, subscriptionMessage, true)
                }
                break
              }
              case 'subscribeRequest': {
                ws.subscribe(message.subscribeRequest.topic)
                break
              }
              case 'unsubscribeRequest': {
                ws.unsubscribe(message.unsubscribeRequest.topic)
                break
              }
            }
            break
          }
        }
      },
      close: (_ws) => {
        logger.log('WS closed')
        components.metrics.decrement('dcl_messaging_connections', {})
        const ws = _ws as any as WebSocket
        if (ws.address) {
          components.nats.publish(`peer.${ws.address}.disconnect`)
        }
      }
    })
}
