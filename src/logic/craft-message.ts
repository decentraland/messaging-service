import { Writer } from 'protobufjs/minimal'
import { ServerMessage } from '../proto/messaging.gen'

// we use a shared writer to reduce allocations and leverage its allocation pool
const writer = new Writer()

export function craftMessage(packet: ServerMessage): Uint8Array {
  writer.reset()
  ServerMessage.encode(packet, writer)
  return writer.finish()
}
