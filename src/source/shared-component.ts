/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseComponent, Component } from "@flamework/components";
import { Constructor } from "@flamework/core/out/utility";
import { Signal } from "@rbxts/beacon";
import { atom, Atom, subscribe } from "@rbxts/charm";
import { client, ClientSyncer, server, ServerSyncer, SyncPatch, SyncPayload } from "@rbxts/charm-sync";
import { HttpService, ReplicatedStorage, RunService } from "@rbxts/services";
import { remotes } from "../remotes";
import { SharedComponentInfo } from "../types";
import { DeepCloneTable, GetConstructorIdentifier, GetInheritanceTree } from "../utilities";
import { ISharedNetwork } from "./network";
import { Pointer } from "./pointer";
import { onSetupSharedComponent } from "./shared-component-handler";

const IsServer = RunService.IsServer();
const IsClient = RunService.IsClient();
const event = ReplicatedStorage.FindFirstChild("REFLEX_DEVTOOLS") as RemoteEvent;

export const OnAddedSharedComponents = new Signal<[id: string, instance: Instance]>();
export const ClientSharedComponents = new Map<string, Instance>(); // ID -> Instance

export const WaitForClientSharedComponent = async (id: string) => {
	if (ClientSharedComponents.has(id)) {
		return ClientSharedComponents.get(id)!;
	}

	const thread = coroutine.running();

	const connection = OnAddedSharedComponents.Connect((newId, instance) => {
		if (id !== newId) return;
		coroutine.resume(thread, instance);
		connection.Disconnect();
	});

	return coroutine.yield() as unknown as Instance;
};

const addSharedComponent = (id: string, instance: Instance) => {
	OnAddedSharedComponents.Fire(id, instance);
	ClientSharedComponents.set(id, instance);
};

export
@Component()
abstract class SharedComponent<S = any, A extends object = {}, I extends Instance = Instance>
	extends BaseComponent<A & { __SERVER_ID?: string }, I>
	implements onSetupSharedComponent
{
	protected pointer?: Pointer;
	protected abstract state: S;
	protected receiver!: ClientSyncer<{}>;
	protected sender!: ServerSyncer<{}, false>;
	/** @client */
	protected isBlockingServerDispatches = false;
	protected readonly remotes: Record<string, ISharedNetwork> = {};
	protected atom: Atom<S>;

	private isEnableDevTool = false;
	private tree: Constructor[];
	private info?: SharedComponentInfo;
	private remoteConnection!: () => void;
	private attributeConnection?: RBXScriptConnection;
	private listeners = new Set<() => void>();

	constructor() {
		super();

		const localAtom = atom();
		this.atom = ((state?: S) => {
			if (state === undefined) {
				if (localAtom() !== this.state) localAtom(this.state);
				return this.state;
			}

			this.state = state;
			return localAtom(state);
		}) as Atom<S>;

		this.initSharedActions();
		this.tree = GetInheritanceTree(this.getConstructor(), SharedComponent as Constructor);
	}

	/**
	 * @returns The current state of the component.
	 */
	public GetState() {
		return this.state;
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
		return this.atom(newState);
	}

	/**
	 * Generates and returns the information about the shared component.
	 *
	 * @return {SharedComponentInfo} The information about the shared component.
	 */
	public GenerateInfo(): SharedComponentInfo {
		assert(this.attributes.__SERVER_ID, "Shared component must have a server id");

		const info = this.info ?? {
			ServerId: this.attributes.__SERVER_ID,
			Identifier: GetConstructorIdentifier(this.getConstructor()),
			SharedIdentifier: GetConstructorIdentifier(this.tree[this.tree.size() - 1]),
			PointerID: this.pointer ? Pointer.GetPointerID(this.pointer) : undefined,
		};

		this.info = info;
		return info;
	}

	/**
	 * Determines whether the given sync patch is allowed to be synced for the specified player.
	 * WARNING: Argument data is read-only!!!.
	 *
	 * @param {Player} player - The player for whom the sync patch is being resolved.
	 * @param {SyncPatch<S>} data - The sync patch to be resolved.
	 * @return {boolean} Returns `true` if the sync patch is allowed to be synced for the player, `false` otherwise.
	 */
	public ResolveIsSyncForPlayer(player: Player, data: SyncPatch<S>): boolean {
		return true;
	}

	/**
	 * Resolves the sync data for a specific player.
	 *
	 * @param {Player} player - The player for whom the sync data is being resolved.
	 * @param {SyncPatch<S>} data - The sync data to be resolved.
	 * @return {SyncPatch<S>} - The resolved sync data.
	 */
	public ResolveSyncForPlayer(player: Player, data: SyncPatch<S>): SyncPatch<S> {
		return data;
	}

	/** @client */
	public AttachDevTool() {
		assert(IsClient, "Must be a client");
		this.isEnableDevTool = true;
	}

	/** @client */
	public DisableDevTool() {
		assert(IsClient, "Must be a client");
		this.isEnableDevTool = false;
	}

	/** @internal @hidden */
	public GetRemote(name: string) {
		return this.remotes[name as never];
	}

	/**
	 * @internal
	 * @hidden
	 **/
	public __DispatchFromServer(payload: SyncPayload<{}>) {
		if (this.isBlockingServerDispatches) return;
		this.receiver.sync(payload);

		if (!RunService.IsStudio() || !this.isEnableDevTool) return;
		event.FireServer({
			name: `${getmetatable(this)}_serverDispatch`,
			args: [],
			state: this.atom(),
		});
	}

	/** @hidden **/
	public onSetup() {
		this.atom(this.state);
		this.pointer?.AddComponent(this);
		IsServer && this._onStartServer();
		IsClient && this._onStartClient();
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
			original?.(this);
		};
	}

	private getConstructor() {
		return getmetatable(this) as Constructor<SharedComponent>;
	}

	private initServerId() {
		if (this.attributes.__SERVER_ID) {
			return;
		}

		this.attributes.__SERVER_ID = HttpService.GenerateGUID(false) as never;
		addSharedComponent(this.attributes.__SERVER_ID!, this.instance);
	}

	private _onStartServer() {
		this.onAttributeChanged("__SERVER_ID", (id, oldValue) => {
			oldValue && ClientSharedComponents.delete(oldValue);
			id && addSharedComponent(id, this.instance);
		});

		this.initServerId();
		this.sender = server({ atoms: { atom: this.atom } });

		this.sender.connect((player, payload) => {
			if (!this.ResolveIsSyncForPlayer(player, (payload.data as Record<string, unknown>).atom as never)) return;

			const copyPayload = DeepCloneTable(payload) as { type: "init"; data: { atom: S } };
			const data = this.ResolveSyncForPlayer(player, copyPayload.data.atom as never);
			copyPayload.data.atom = data as never;

			remotes._shared_component_dispatch.fire(player, copyPayload, this.GenerateInfo());
		});

		const hydrate = (player: Player) => {
			if (!this.ResolveIsSyncForPlayer(player, this.atom() as never)) return;

			remotes._shared_component_dispatch.fire(
				player,
				{ type: "init", data: { atom: this.atom() } },
				this.GenerateInfo(),
			);
		};

		this.remoteConnection = remotes._shared_component_start.connect(
			(player, instance) => instance === this.instance && hydrate(player),
		);
	}

	private _onStartClient() {
		this.receiver = client({
			atoms: { atom: this.atom },
		});

		const id = this.instance.GetAttribute("__SERVER_ID");
		if (id) {
			addSharedComponent(id as string, this.instance);
		}

		let oldValueId = id as string | undefined;
		this.attributeConnection = this.instance.GetAttributeChangedSignal("__SERVER_ID").Connect(() => {
			oldValueId && ClientSharedComponents.delete(oldValueId);

			const id = this.instance.GetAttribute("__SERVER_ID") as string;
			id && addSharedComponent(id, this.instance);

			oldValueId = id;
		});

		remotes._shared_component_start.fire(this.instance);
	}

	public destroy() {
		super.destroy();
		this.remoteConnection?.();
		this.attributeConnection?.Disconnect();
		this.listeners.forEach((unsubscribe) => unsubscribe());

		for (const [_, remote] of pairs(this.remotes)) {
			remote.Destroy();
		}
	}
}
