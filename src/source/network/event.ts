import { Signal } from "@rbxts/beacon";
import { Players } from "@rbxts/services";
import { t } from "@rbxts/t";
import { ISharedNetwork } from ".";
import { remotes } from "../../remotes";
import { IsClient, IsServer, logAssert, logWarning } from "../../utilities";
import { SharedComponent } from "../shared-component";
import { SharedRemoteAction } from "./action";

export const IsSharedComponentRemoteEvent = (
	obj: ISharedNetwork,
): obj is
	| SharedRemoteEventServerToClient<[]>
	| SharedRemoteEventClientToServer<[]>
	| SharedRemoteAction<[], unknown> => {
	return "Identifier" in obj;
};

export class SharedRemoteEventServerToClient<A extends unknown[]> implements ISharedNetwork {
	public static readonly RemoteEventIndefinitely = "__SHARED_COMPONENT_REMOTE_EVENT_SERVER_TO_CLIENT";

	public componentReferense!: SharedComponent<{}, {}, Instance>;
	public name!: string;
	public readonly Identifier = SharedRemoteEventServerToClient.RemoteEventIndefinitely;

	private signal!: Signal<A>;
	private guard: t.check<unknown>;

	public static Indefinitely(obj: ISharedNetwork): obj is SharedRemoteEventServerToClient<[]> {
		return obj.Identifier === SharedRemoteEventServerToClient.RemoteEventIndefinitely;
	}

	constructor(guard: t.check<unknown>) {
		this.guard = guard;
		IsClient && (this.signal = new Signal<A>());
	}

	private send(players: Player[], ...args: A) {
		players.forEach((player) => {
			remotes._shared_component_remote_event_Client.fire(
				player,
				this.componentReferense.GetID(),
				this.name,
				args,
			);
		});
	}

	/**@hidden @internal */
	public GetSignal() {
		return this.signal;
	}

	/**
	 * @hidden
	 * @internal
	 */
	public GetGuard() {
		return this.guard;
	}

	private filterPlayersToConnect(players: Player[] | Player) {
		if (typeIs(players, "Instance")) {
			return this.componentReferense.IsConnectedPlayer(players) ? players : undefined;
		}

		return players.filter((player) => this.componentReferense.IsConnectedPlayer(player));
	}

	/**
	 * Sends this request to the specified player(s).
	 * @param players The player(s) that will receive this event
	 * @server
	 */
	public Fire(players: Player[] | Player, ...args: A) {
		logAssert(IsServer, "Event can't be fired on client");

		players = this.filterPlayersToConnect(players) as Player[] | Player;
		if (players === undefined) return;

		this.send(typeIs(players, "Instance") ? [players] : players, ...args);
	}

	/**
	 * Sends this request to all players, excluding the specified player(s).
	 * @param players The player(s) that will not receive this event
	 * @server
	 */
	public Except(players: Player[] | Player, ...args: A) {
		logAssert(IsServer, "Event can't be fired on client");

		players = this.filterPlayersToConnect(players) as Player[] | Player;
		if (players === undefined) return;

		const playerArray = typeIs(players, "Instance") ? [players] : players;

		this.send(
			Players.GetPlayers().filter((player) => !playerArray.includes(player)),
			...args,
		);
	}

	/**
	 * Sends this request to all connected players.
	 * @server
	 */
	public Broadcast(...args: A) {
		logAssert(IsServer, "Event can't be fired on client");

		const players = this.filterPlayersToConnect(Players.GetPlayers());
		if (!players) return;

		this.send(players as Player[], ...args);
	}

	/** @client */
	public Connect(callback: (...args: A) => void) {
		logAssert(IsClient, "Event can't be connected on server");

		return this.signal.Connect((...args) => {
			if (!this.guard(args)) {
				return;
			}
			callback(...(args as never));
		});
	}

	public Destroy() {
		this.signal?.Destroy();
	}
}

export class SharedRemoteEventClientToServer<A extends unknown[]> implements ISharedNetwork {
	public static readonly RemoteEventIndefinitely = "__SHARED_COMPONENT_REMOTE_EVENT_CLIENT_TO_SERVER";
	public componentReferense!: SharedComponent<{}, {}, Instance>;
	public name!: string;

	private signal!: Signal<[player: Player, ...A]>;
	private guard: t.check<unknown>;

	public readonly Identifier = SharedRemoteEventClientToServer.RemoteEventIndefinitely;

	public static Indefinitely(obj: ISharedNetwork): obj is SharedRemoteEventClientToServer<[]> {
		return obj.Identifier === SharedRemoteEventClientToServer.RemoteEventIndefinitely;
	}

	constructor(guard: t.check<unknown>) {
		this.guard = guard;
		IsServer && (this.signal = new Signal<[player: Player, ...A]>());
	}

	/**
	 * @hidden
	 * @internal
	 */
	public GetSignal() {
		return this.signal;
	}

	/**
	 * @hidden
	 * @internal
	 */
	public GetGuard() {
		return this.guard;
	}

	/**
	 * Fires the remote for the server to process. Calls the listeners
	 * connected to the same remote.
	 *
	 * Arguments are validated on the server before they are processed.
	 *
	 * @client
	 */
	public Fire(...args: A) {
		logAssert(IsClient, "Event can't be fired on server");

		if (!this.componentReferense.GetIsConnected()) {
			logWarning(`Component with id ${this.componentReferense.GenerateInfo().InstanceId} not connected`);
			return;
		}

		remotes._shared_component_remote_event_Server.fire(this.componentReferense.GetID(), this.name, args);
	}

	/** @server */
	public Connect(callback: (player: Player, ...args: A) => void) {
		logAssert(IsServer, "Event can't be connected on client");

		return this.signal.Connect((player, ...args) => {
			if (!this.guard(args)) {
				return;
			}
			callback(player, ...(args as never));
		});
	}

	public Destroy() {
		this.signal?.Destroy();
	}
}
