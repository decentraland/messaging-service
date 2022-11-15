import { AuthChain } from '@dcl/schemas'
import { AppComponents, WebSocket } from '../types'
import { Authenticator } from '@dcl/crypto'
import { wsAsAsyncChannel } from './ws-as-async-channel'
import { normalizeAddress } from './address'
import { craftMessage } from './craft-message'

export async function handleSocketLinearProtocol(
  { logs, ethereumProvider }: Pick<AppComponents, 'logs' | 'ethereumProvider'>,
  socket: WebSocket
) {
  const logger = logs.getLogger('LinearProtocol')
  // Wire the socket to a pushable channel
  const channel = wsAsAsyncChannel(socket)

  try {
    // process the messages
    const challengeToSign = 'dcl-' + Math.random().toString(36)

    const challengeMessage = craftMessage({
      message: {
        $case: 'challengeRequired',
        challengeRequired: { challengeToSign }
      }
    })
    if (socket.send(challengeMessage, true) !== 1) {
      logger.error('Closing connection: cannot send challenge')
      socket.close()
      return
    }

    const packet = await channel.yield(1000, 'Timed out waiting for signed challenge response')

    if (!packet.message || packet.message.$case !== 'signedChallenge') {
      throw new Error('Invalid protocol. signedChallenge packet missed')
    }

    const authChain = JSON.parse(packet.message.signedChallenge.authChainJson) as AuthChain
    const result = await Authenticator.validateSignature(challengeToSign, authChain, ethereumProvider)

    const address = normalizeAddress(authChain[0].payload)

    if (!result.ok) {
      logger.error(`Authentication failed`, { message: result.message } as any)
      throw new Error('Authentication failed')
    }
    logger.debug(`Authentication successful`, { address })

    socket.address = address
  } finally {
    // close the channel to remove the listener
    channel.close()
  }
}
