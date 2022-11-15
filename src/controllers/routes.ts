import mitt from 'mitt'
import * as uWS from 'uWebSockets.js'
import { GlobalContext, WebSocket, Stage } from '../types'
import { handleSocketLinearProtocol } from '../logic/handle-linear-protocol'
import { craftMessage } from '../logic/craft-message'
import { ClientMessage } from '../proto/messaging.gen'

export async function setupRouter({ app, components }: GlobalContext): Promise<void> {
  const { logs, metrics, config } = components
  const logger = logs.getLogger('messaging')

  const commitHash = await config.getString('COMMIT_HASH')
  const status = JSON.stringify({ commitHash })

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
        const ws = _ws as any as WebSocket
        ws.stage = Stage.LINEAR
        handleSocketLinearProtocol(components, ws)
          .then(() => {
            ws.stage = Stage.READY
          })
          .catch((err: any) => {
            logger.error(err)
            try {
              ws.close()
            } catch {}
          })
      },
      message: (_ws, data, isBinary) => {
        if (!isBinary) {
          logger.log('protocol error: data is not binary')
          return
        }

        const ws = _ws as any as WebSocket

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
              case 'publishRequest': {
                const {
                  publishRequest: { topic, payload }
                } = message

                const subscriptionMessage = craftMessage({
                  message: {
                    $case: 'subscriptionMessage',
                    subscriptionMessage: {
                      sender: ws.address!,
                      topic: topic,
                      body: payload
                    }
                  }
                })
                app.publish(topic, subscriptionMessage, true)
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
    })
}
