/**
 * Run the mock gRPC server standalone: `yarn grpc:mock`.
 * Binds on GRPC_PORT (default 50051) so you can point a client / grpcurl at it.
 */
import { startGrpcMock } from "./mock-server";

const port = Number(process.env.GRPC_PORT ?? 50051);

startGrpcMock(port).then(({ port: bound }) => {
    // eslint-disable-next-line no-console
    console.log(`[grpc:mock] casino GameService mock listening on 0.0.0.0:${bound}`);
});
