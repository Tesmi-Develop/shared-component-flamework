/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseComponent, Component } from "@flamework/components";
import { onSetupSharedComponent, SharedComponentHandler } from "./shared-component-handler";
import { HttpService, Players, ReplicatedStorage, RunService } from "@rbxts/services";
import { DeepCloneTable, GetConstructorIdentifier, GetInheritanceTree } from "../utilities";
import { ClassProducer, IClassProducer } from "@rbxts/reflex-class";
import { remotes } from "../remotes";
import { Constructor } from "@flamework/core/out/utility";
import { SharedComponentInfo } from "../types";
import { Pointer } from "./pointer";
import { ISharedNetwork } from "./network";
import { Atom, ClientSyncer, sync, SyncPatch, SyncPayload } from "@rbxts/charm";
import { Dependency } from "@flamework/core";
import { Signal } from "@rbxts/beacon";

const IsServer = RunService.IsServer();
const IsClient = RunService.IsClient();
const event = ReplicatedStorage.FindFirstChild("REFLEX_DEVTOOLS") as RemoteEvent;

const mergeSharedComponent = () => {
	const typedSharedComponent = SharedComponent as object;
	const typedClassProducer = ClassProducer as unknown as { constructor: (self: object) => void };

	for (const [i, v] of pairs(typedClassProducer)) {
		if (i === "constructor") continue;
		typedSharedComponent[i as never] = v as never;
	}

	return typedClassProducer.constructor;
};

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
	implements IClassProducer<S>, onSetupSharedComponent
{
	protected pointer: Pointer | undefined;
	protected abstract state: S;
	private _classProducerLink: IClassProducer<S>;
	protected receiver!: ClientSyncer<{}>;
	private tree: Constructor[];
	/** @client */
	protected isBlockingServerDispatches = false;
	private isEnableDevTool = false;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	protected readonly remotes: Record<string, ISharedNetwork> = {};
	protected atom!: Atom<Record<string, unknown>>;
	private broadcastConnection?: () => void;
	private info?: SharedComponentInfo;
	private remoteConnection!: () => void;

	constructor() {
		super();
		classProducerConstructor(this);
		this.initSharedActions();

		this._classProducerLink = this as unknown as IClassProducer<S>;
		this.tree = GetInheritanceTree(this.getConstructor(), SharedComponent as Constructor);
	}

	/** @internal @hidden */
	public GetRemote(name: string) {
		return this.remotes[name as never];
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
		this.pointer?.AddComponent(this);
		IsServer && this._onStartServer();
		IsClient && this._onStartClient();
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

	private _onStartServer() {
		this.onAttributeChanged("__SERVER_ID", (id, oldValue) => {
			oldValue && ClientSharedComponents.delete(oldValue);
			id && addSharedComponent(id, this.instance);
		});

		this.initServerId();
		const sharedComponentHandler = Dependency<SharedComponentHandler>();
		const observer = sharedComponentHandler.GetAtomObserver();

		const generatePayload = (payload: SyncPatch<{}>) => {
			return {
				type: "patch",
				data: {
					atom: payload,
				},
			};
		};

		this.broadcastConnection = observer.Connect(this.atom as never, (patch: {}) => {
			const originalPayload = generatePayload(patch);

			Players.GetPlayers().forEach((player) => {
				if (!this.ResolveIsSyncForPlayer(player, originalPayload.data.atom as never)) return;

				const copyPayload = DeepCloneTable(originalPayload) as { type: "init"; data: { atom: S } };
				const data = this.ResolveSyncForPlayer(player, copyPayload.data.atom as never);
				copyPayload.data.atom = data as never;

				remotes._shared_component_dispatch.fire(player, copyPayload, this.GenerateInfo());
			});
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
		this.receiver = sync.client({
			atoms: { atom: this.atom },
		});

		if (this.attributes.__SERVER_ID) {
			addSharedComponent(this.attributes.__SERVER_ID, this.instance);
		}

		this.onAttributeChanged("__SERVER_ID", (id, oldValue) => {
			oldValue && ClientSharedComponents.delete(oldValue);
			id && addSharedComponent(id, this.instance);
		});

		remotes._shared_component_start.fire(this.instance);
	}

	// Implement types
	GetState(): S {
		throw "Method not implemented.";
	}
	Subscribe(listener: (state: S, previousState: S) => void): () => void;
	Subscribe<T>(selector: (state: S) => T, listener: (state: T, previousState: T) => void): () => void;
	Subscribe<T>(
		selector: (state: S) => T,
		predicate: ((state: T, previousState: T) => boolean) | undefined,
		listener: (state: T, previousState: T) => void,
	): () => void;
	Subscribe<T>(...args: unknown[]): () => void;
	Subscribe(
		selector?: unknown,
		predicate?: unknown,
		listener?: unknown,
		...rest: unknown[]
	): (() => void) | (() => void) | (() => void) | (() => void) {
		throw "Method not implemented.";
	}
	Dispatch(newState: S): void {
		throw "Method not implemented.";
	}

	/** @hidden **/
	Destroy(): void {
		throw "Method not implemented.";
	}

	public destroy() {
		super.destroy();
		this.broadcastConnection?.();
		this.remoteConnection?.();
		this._classProducerLink.Destroy();

		for (const [name, remote] of pairs(this.remotes)) {
			remote.Destroy();
		}
	}
}

const classProducerConstructor = mergeSharedComponent();
