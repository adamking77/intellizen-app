import { JsonRpcGatewayClient } from "./json-rpc-gateway";

let client: JsonRpcGatewayClient | null = null;

/** The one gateway client this window talks to Hermes through. Connection is
 *  managed by `use-engine.ts`; everything else only sends and listens. */
export function getGatewayClient(): JsonRpcGatewayClient {
  return (client ??= new JsonRpcGatewayClient({ requestIdPrefix: "iz" }));
}

/** Tests swap in a fake; pass null to reset. */
export function setGatewayClient(next: JsonRpcGatewayClient | null) {
  client = next;
}
