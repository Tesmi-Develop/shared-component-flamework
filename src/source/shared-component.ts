/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseComponent, Component } from "@flamework/components";
import { OnStart } from "@flamework/core";
import { Constructor } from "@flamework/core/out/utility";
import { Signal } from "@rbxts/beacon";
import Charm, { atom, Atom, subscribe } from "@rbxts/charm";
import { isNone, SyncPatch, SyncPayload } from "@rbxts/charm-sync";
import { Players, ReplicatedStorage, RunService } from "@rbxts/services";
import { remotes } from "../remotes";
import { PlayerAction, SharedComponentInfo } from "../types";
import { GenerateID, GetConstructorIdentifier, GetSharedComponentCtor, logAssert, logWarning } from "../utilities";
import { ISharedNetwork } from "./network";
import patch from "./patch";
import { Pointer } from "./pointer";

const IsServer = RunService.IsServer();
const IsClient = RunService.IsClient();
const event = ReplicatedStorage.FindFirstChild("REFLEX_DEVTOOLS") as RemoteEvent;

export const InstancesWithId = new Map<string, Instance>(); // ID -> Instance

export const GetInstanceWithId = (id: string) => {
	return InstancesWithId.get(id);
};

const registerInstanceId = (id: string, instance: Instance) => {
	InstancesWithId.set(id, instance);
	instance.Destroying.Connect(() => {
		removeInstanceId(id);
	});
};

export const removeInstanceId = (id: string) => {
	InstancesWithId.delete(id);
};

export
@Component()
abstract class SharedComponent<S = any, A extends object = {}, I extends Instance = Instance>
	extends BaseComponent<A & { __SERVER_ID?: string }, I>
	implements OnStart
{
	public static readonly instances: Map<string, SharedComponent> = new Map<string, SharedComponent>(); // ID -> SharedComponent
	public static readonly onAddedInstances = new Signal<[SharedComponent, string]>();

	protected pointer?: Pointer;
	protected abstract state: S;
	/** @client */
	protected isBlockingServerDispatches = false;
	/** @client */
	protected isAutoConnect = true;
	protected readonly remotes: Record<string, ISharedNetwork> = {};
	protected readonly atom = atom() as Atom<S>;

	private isConnected = false;
	private isEnableDevTool = false;
	private info?: SharedComponentInfo;
	private attributeConnection?: RBXScriptConnection;
	private listeners = new Set<() => void>();
	private connectedPlayers = new Set<Player>();
	private playerRemovingConnection?: RBXScriptConnection;
	private scheduledSyncConnection?: RBXScriptConnection;
	private uniqueId = "";
	private instanceServerId?: string;
	private sharedComponentCtor: Constructor<SharedComponent>;
	private onDoneHydrating = new Signal<[]>();
	private isDestroyed = false;
	private isDoneHydrating = false;

	constructor() {
		super();

		const cleanup = subscribe(this.atom, (state) => {
			if (IsServer) this.scheduleSync(this.state as S);
			this.state = state as S;
		});
		this.listeners.add(cleanup);

		this.initSharedActions();
		this.sharedComponentCtor = GetSharedComponentCtor(
			this.getConstructor(),
			SharedComponent as unknown as Constructor,
		);
	}

	public onStart(): void {}

	public GetID() {
		return this.uniqueId;
	}

	/**
	 * @returns The current state of the component.
	 */
	public GetState() {
		return this.state;
	}

	/**
	 * Gets whether the component is currently connected to the server.
	 * @returns Whether the component is currently connected to the server.
	 * @client
	 */
	public GetIsConnected(): boolean {
		return this.isConnected;
	}

	/**
	 * Subscribe to changes in the state of the component.
	 *
	 * If provided a single function argument, the function will be called whenever the state of the component changes.
	 *
	 * If provided two arguments, the first argument should be a selector function that takes the current state of the component and returns a new value, and the second argument should be a listener function that takes the new value and the previous value as arguments.
	 *
	 * @returns A function that can be called to unsubscribe from further updates.
	 */
	public Subscribe(listener: (state: S, previousState: S) => void): () => void;
	public Subscribe<T>(selector: (state: S) => T, listener: (state: T, previousState: T) => void): () => void;
	public Subscribe(...args: unknown[]) {
		if (this.isDestroyed) return () => {};
		if (args.size() === 1) {
			const [listener] = args;
			const unsubscribe = subscribe(this.atom, listener as never);
			this.listeners.add(unsubscribe);

			return () => {
				unsubscribe();
				this.listeners.delete(unsubscribe);
			};
		}

		const [selector, listener] = args as [(state: S) => unknown, (state: unknown, previousState: unknown) => void];
		const unsubscribe = subscribe(() => selector(this.atom()), listener as never);
		this.listeners.add(unsubscribe);

		return () => {
			unsubscribe();
			this.listeners.delete(unsubscribe);
		};
	}

	/**
	 * Sets the state of the shared component, and notifies all subscribers of the update.
	 *
	 * @param newState The new state of the shared component.
	 */
	public Dispatch(newState: S) {
		if (this.isDestroyed) return;
		return this.atom(newState);
	}

	/**
	 * Generates and returns the information about the shared component.
	 *
	 * @return {SharedComponentInfo} The information about the shared component.
	 */
	public GenerateInfo(): SharedComponentInfo {
		const id = this.instance.GetAttribute("__SERVER_ID") as string;
		const info = this.info ?? {
			InstanceId: id ?? "",
			Identifier: GetConstructorIdentifier(this.getConstructor()),
			SharedIdentifier: GetConstructorIdentifier(this.sharedComponentCtor),
			PointerID: this.pointer ? Pointer.GetPointerID(this.pointer) : undefined,
		};

		if (info.InstanceId !== id) {
			info.InstanceId = id ?? "";
		}

		this.info = info;
		return info;
	}

	/**
	 * Disconnects a player.
	 *
	 * @param player - The player to disconnect.
	 * @server
	 */

	public DisconnectPlayer(player: Player) {
		if (this.isDestroyed) return;
		if (!this.connectedPlayers.has(player)) return;

		this.connectedPlayers.delete(player);
		this.OnDisconnectedPlayer(player);
		remotes._shared_component_disconnected.fire(player, this.uniqueId ?? this.GenerateInfo());
	}

	/**
	 * Disconnects the local player.
	 * @client
	 */
	public async Disconnect() {
		if (this.isDestroyed) return;
		if (this.getServerId() === undefined) {
			logWarning("Client is not disconnected to a server component, because the ServerId is not set.");
			return;
		}

		if (!this.isConnected) return;
		return await this.sendDisconnectAction();
	}

	/**
	 * Connects the local player.
	 * @client
	 */
	public async Connect() {
		if (this.isDestroyed) return;
		if (this.getServerId() === undefined) {
			logWarning("Client is not connected to a server component, because the ServerId is not set.");
			return;
		}

		if (this.isConnected) return true;
		return await this.sendConnectAction();
	}

	/**
	 * Determines whether the given sync patch is allowed to be synced for the specified player.
	 * WARNING: Argument data is read-only!!!.
	 *
	 * @param {Player} player - The player for whom the sync patch is being resolved.
	 * @param {SyncPatch<S>} data - The sync patch to be resolved.
	 * @return {boolean} Returns `true` if the sync patch is allowed to be synced for the player, `false` otherwise.
	 * @server
	 */
	public ResolveIsSyncForPlayer(player: Player, data: SyncPatch<S>): boolean {
		return true;
	}

	/**
	 * Determines whether the specified player has access to the connection.
	 *
	 * @param {Player} player - The player for whom access is being resolved.
	 * @return {boolean} Returns `true` if the player is allowed to the connection, `false` otherwise.
	 * @server
	 */

	public ResolveConnectionPermission(player: Player): boolean {
		return true;
	}

	/**
	 * Resolves the sync data for a specific player.
	 *
	 * @param {Player} player - The player for whom the sync data is being resolved.
	 * @param {SyncPatch<S>} data - The sync data to be resolved.
	 * @return {SyncPatch<S>} - The resolved sync data.
	 * @server
	 */
	public ResolveSyncForPlayer(player: Player, data: SyncPatch<S>): SyncPatch<S> {
		return data;
	}

	/**
	 * Called when a player connects to the component.
	 * @param {Player} player The player that connected.
	 * @server
	 */
	public OnConnectedPlayer(player: Player) {}

	/**
	 * Called when a player disconnects to the component.
	 * @param {Player} player The player that disconnected.
	 * @server
	 */
	public OnDisconnectedPlayer(player: Player) {}

	/**
	 * Called when a local player connects to the component.
	 * @client
	 */
	public OnConnected() {}

	/**
	 * Called when a local player disconnects to the component.
	 * @client
	 */
	public OnDisconnected() {}

	/**
	 * Retrieves the set of players currently connected to the component.
	 *
	 * @returns A set of connected players.
	 * @server
	 */
	public GetConnectedPlayers() {
		return this.connectedPlayers as ReadonlySet<Player>;
	}

	/**
	 * Checks if a player is currently connected to the component.
	 *
	 * @param {Player} player - The player to check for connection status.
	 * @return {boolean} Returns `true` if the player is connected, `false` otherwise.
	 * @server
	 **/
	public IsConnectedPlayer(player: Player): boolean {
		if (this.isDestroyed) return false;
		return this.connectedPlayers.has(player);
	}

	/** @client */
	public AttachDevTool() {
		logAssert(IsClient, "Must be a client");
		this.isEnableDevTool = true;
	}

	/** @client */
	public DisableDevTool() {
		logAssert(IsClient, "Must be a client");
		this.isEnableDevTool = false;
	}

	/** @internal @hidden */
	public __GetRemote(name: string) {
		return this.remotes[name as never];
	}

	/**
	 * @internal
	 * @hidden
	 **/
	public async __DispatchFromServer(payload: SyncPayload<{}>) {
		if (this.isBlockingServerDispatches || this.isDestroyed) return;

		if (payload.type === "patch" && !this.isDoneHydrating) {
			this.onDoneHydrating.Wait();
		}

		Charm.batch(() => {
			if (payload.type === "patch") {
				this.atom(patch.apply(this.state, payload.data as S));
				return;
			}

			this.isDoneHydrating = true;
			this.onDoneHydrating.Fire();

			if (isNone(payload.data)) {
				this.atom(undefined as S);
			} else {
				this.atom(payload.data as S);
			}
		});

		if (!RunService.IsStudio() || !this.isEnableDevTool) return;
		event.FireServer({
			name: `${getmetatable(this)}_serverDispatch`,
			args: [],
			state: this.atom(),
		});
	}

	/**
	 * @internal
	 * @hidden
	 **/
	public __OnPlayerConnect(player: Player) {
		if (this.isDestroyed) return false;

		const isAccess = this.ResolveConnectionPermission(player);
		if (!isAccess) return false;

		this.connectedPlayers.add(player);
		this.OnConnectedPlayer(player);

		return true;
	}

	/**
	 * @internal
	 * @hidden
	 **/
	public __OnPlayerDisconnect(player: Player) {
		this.connectedPlayers.delete(player);
		this.OnDisconnectedPlayer(player);
	}

	/**
	 * @internal
	 * @hidden
	 **/
	public __Hydrate = (player: Player) => {
		this.onSendPayload(player, this.__GenerateHydrateData() as never);
	};

	/**
	 * @internal
	 * @hidden
	 **/
	public __GenerateHydrateData = () => {
		return {
			type: "init" as const,
			data: this.state ?? patch.None,
		};
	};

	/**
	 * @internal
	 * @hidden
	 **/
	public __Disconnected() {
		if (!this.isConnected || this.isDestroyed) return;
		this.isConnected = false;
		SharedComponent.instances.delete(this.uniqueId);
		this.uniqueId = "";
		this.isDoneHydrating = false;
		this.OnDisconnected();
	}

	/** @hidden **/
	private onSetup() {
		this.atom(this.state);
		this.pointer?.AddComponent(this);
		IsServer && this._onStartServer();
		IsClient && this._onStartClient();
	}

	private scheduleSync(prevState: S) {
		if (this.scheduledSyncConnection || this.isDestroyed) return;

		this.scheduledSyncConnection = RunService.Heartbeat.Connect(() => {
			if (this.connectedPlayers.isEmpty()) {
				this.scheduledSyncConnection?.Disconnect();
				this.scheduledSyncConnection = undefined;
				return;
			}

			const payload: SyncPayload<{}> = {
				type: "patch",
				data: patch.diff(prevState, this.atom()) as never,
			};

			for (const player of this.connectedPlayers) {
				this.onSendPayload(player, payload);
			}

			this.scheduledSyncConnection?.Disconnect();
			this.scheduledSyncConnection = undefined;
		});
	}

	private onSendPayload(player: Player, payload: SyncPayload<{}>) {
		if (this.isDestroyed) return;
		if (!this.ResolveIsSyncForPlayer(player, payload.data as Record<string, unknown> as never)) return;

		const data = this.ResolveSyncForPlayer(player, payload.data as Record<string, unknown> as never);
		(payload.data as Record<string, unknown>) = data as never;

		remotes._shared_component_dispatch.fire(player, payload, this.uniqueId);
	}

	private initSharedActions() {
		const ctor = getmetatable(this) as { onStart?: (context: SharedComponent) => void };
		const original = ctor.onStart;

		ctor.onStart = function (this: SharedComponent) {
			for (const [i, remote] of pairs(this.remotes)) {
				const newRemote = remote as ISharedNetwork;
				newRemote.componentReferense = this;
				newRemote.name = i as string;
			}
			this.onSetup();
			original?.(this);
		};
	}

	private getServerId() {
		if (this.instanceServerId) return this.instanceServerId;
		return (this.instanceServerId = this.instance.GetAttribute("__SERVER_ID") as string | undefined);
	}

	private getConstructor() {
		return getmetatable(this) as Constructor<SharedComponent>;
	}

	private initInstanceID() {
		if (this.getServerId() !== undefined) {
			return;
		}

		const id = GenerateID();
		this.instance.SetAttribute("__SERVER_ID", id);
		registerInstanceId(id, this.instance);
	}

	private _onStartServer() {
		this.onAttributeChanged("__SERVER_ID", (id, oldValue) => {
			if (oldValue) InstancesWithId.delete(oldValue);
			if (id) registerInstanceId(id, this.instance);
		});

		this.uniqueId = GenerateID();
		SharedComponent.instances.set(this.uniqueId, this);
		SharedComponent.onAddedInstances.Fire(this, this.uniqueId);
		this.initInstanceID();

		this.playerRemovingConnection = Players.PlayerRemoving.Connect((player) => {
			if (!this.connectedPlayers.has(player)) return;
			this.connectedPlayers.delete(player);
			this.OnDisconnectedPlayer(player);
		});
	}

	/** @client */
	private async sendConnectAction() {
		if (this.isDestroyed) return false;
		if (this.isConnected) return true;

		const [success, id, payload] = await remotes._shared_component_connection(
			this.GenerateInfo(),
			PlayerAction.Connect,
		);
		if (!success) return false;

		if (payload === undefined) {
			logWarning("Server not send hydrate data.");
		}

		if (payload !== undefined) {
			this.__DispatchFromServer(payload);
		}

		this.isConnected = true;
		this.uniqueId = id;
		SharedComponent.instances.set(this.uniqueId, this);
		SharedComponent.onAddedInstances.Fire(this, this.uniqueId);
		this.OnConnected();

		return true;
	}

	/** @client */
	private async sendDisconnectAction() {
		if (this.isDestroyed) return;
		if (!this.isConnected) return;

		await remotes._shared_component_connection(this.uniqueId, PlayerAction.Disconnect);
		if (!this.isConnected) return;

		this.isConnected = false;
		this.OnDisconnected();

		return;
	}

	private _onStartClient() {
		const id = this.getServerId();
		if (id !== undefined) {
			registerInstanceId(id as string, this.instance);
		}

		let oldValueId = id as string | undefined;
		this.attributeConnection = this.instance.GetAttributeChangedSignal("__SERVER_ID").Connect(() => {
			if (oldValueId !== undefined) InstancesWithId.delete(oldValueId);

			const id = this.getServerId();
			if (id !== undefined) registerInstanceId(id, this.instance);

			oldValueId = id;
			if (id !== undefined && !this.isConnected && this.isAutoConnect) this.sendConnectAction();
		});

		if (id !== undefined && !this.isConnected && this.isAutoConnect) this.sendConnectAction();
	}

	public destroy() {
		if (this.isDestroyed) return;
		super.destroy();

		if (IsServer) {
			this.connectedPlayers.forEach((player) => {
				this.DisconnectPlayer(player);
			});
		}

		if (IsClient) {
			this.sendDisconnectAction();
		}

		this.attributeConnection?.Disconnect();
		this.playerRemovingConnection?.Disconnect();
		this.scheduledSyncConnection?.Disconnect();
		this.onDoneHydrating.Destroy();
		this.listeners.forEach((unsubscribe) => unsubscribe());
		this.connectedPlayers.clear();
		if (this.uniqueId !== "")
			task.defer(() => {
				if (SharedComponent.instances.get(this.uniqueId) !== this) return;
				SharedComponent.instances.delete(this.uniqueId);
			});

		for (const [_, remote] of pairs(this.remotes)) {
			remote.Destroy();
		}
		this.isDoneHydrating = false;
		this.isDestroyed = true;
	}
}
