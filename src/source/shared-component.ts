import { BaseComponent, Component } from "@flamework/components";
import { onSetupSharedComponent, SharedComponentHandler } from "./shared-component-handler";
import { Players, ReplicatedStorage, RunService } from "@rbxts/services";
import { DeepCloneTable, DeepReadonly, GetConstructorIdentifier, GetInheritanceTree } from "../utilities";
import { ClassProducer, IClassProducer } from "@rbxts/reflex-class";
import { remotes } from "../remotes";
import { Constructor } from "@flamework/core/out/utility";
import { SharedComponentInfo } from "../types";
import { Pointer } from "./pointer";
import { ISharedNetwork } from "./network";
import { Atom, ClientSyncer, subscribe, sync, SyncPatch, SyncPayload } from "@rbxts/charm";
import { Dependency } from "@flamework/core";

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

export
@Component()
abstract class SharedComponent<S extends object = {}, A extends object = {}, I extends Instance = Instance>
	extends BaseComponent<A, I>
	implements IClassProducer<S>, onSetupSharedComponent
{
	protected pointer: Pointer | undefined;
	protected abstract state: S;
	private _classProducerLink: IClassProducer;
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

	constructor() {
		super();
		classProducerConstructor(this);
		this.initSharedActions();

		this._classProducerLink = this as unknown as IClassProducer;
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

	/**
	 * Generates and returns the information about the shared component.
	 *
	 * @return {SharedComponentInfo} The information about the shared component.
	 */
	public GenerateInfo(): SharedComponentInfo {
		const info = this.info ?? {
			Instance: this.instance,
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

		this.broadcastConnection = observer.Connect(this.atom, (patch) => {
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

		remotes._shared_component_start.connect((player, instance) => instance === this.instance && hydrate(player));
	}

	private _onStartClient() {
		this.receiver = sync.client({
			atoms: { atom: this.atom },
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
		this._classProducerLink.Destroy();

		for (const [name, remote] of pairs(this.remotes)) {
			remote.Destroy();
		}
	}
}

const classProducerConstructor = mergeSharedComponent();
