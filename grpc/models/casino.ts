/**
 * TS message types for the casino GameService.
 *
 * Hand-written to mirror `grpc/proto/casino/game.proto` because we load the
 * proto dynamically (@grpc/proto-loader). Field names are camelCase to match
 * `keepCase: false` in `grpc/load-proto.ts`. Keep these in sync with the proto
 * — or generate them with buf + ts-proto (see grpc/README.md).
 */

export interface GetBalanceRequest {
    playerId: string;
}
export interface BalanceResponse {
    playerId: string;
    balance: number;
    currency: string;
}

export interface PlaceBetRequest {
    playerId: string;
    roundId: string;
    amount: number;
    market: string;
}
export interface PlaceBetResponse {
    betId: string;
    accepted: boolean;
    balanceAfter: number;
}

export interface StreamGameStateRequest {
    tableId: string;
}
export interface GameStateEvent {
    tableId: string;
    phase: string;
    sequence: number;
    payload: string;
}

export interface PlayerAction {
    playerId: string;
    action: string;
    amount: number;
}
export interface RoundSummary {
    roundId: string;
    totalStaked: number;
    netResult: number;
    actionCount: number;
}
