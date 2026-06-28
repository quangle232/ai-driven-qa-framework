/**
 * Single load point for the casino proto, shared by the client and the mock so
 * they can never load different definitions.
 *
 * Dynamic loading via @grpc/proto-loader (no codegen step). For fully-typed
 * stubs adopt buf + ts-proto and point the client at the generated code — see
 * grpc/README.md (`yarn proto:gen`).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";

const here = path.dirname(fileURLToPath(import.meta.url));
export const PROTO_PATH = path.resolve(here, "proto/casino/game.proto");

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: false, // camelCase fields (matches grpc/models/casino.ts)
    longs: Number,
    enums: String,
    defaults: true,
    oneofs: true,
});

const proto = grpc.loadPackageDefinition(packageDefinition) as any;

/** The generated GameService client constructor + `.service` definition. */
export const GameService = proto.casino.game.v1.GameService;
